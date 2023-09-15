// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

contract Xbit is ERC20, ERC20Burnable, Pausable, Ownable {
    ERC20 _wbtc;
    ERC20 _usdt;
    ERC20 _xexp;
    address private MAINTAINER_ADDRESS = address(0x0);

    uint256 private constant WITHDRAW_FEE_MILLIONTH_RATIO = 1000; // 0.1%
    uint256 private constant RAND_MAX = 2 ** 128;

    struct RequestStatus {
        bool exists; // whether a requestId exists
        uint256 requestId; // id of the request
        uint256 initialBlock; // block number of the request created
        address player; // address of the player
        address referrer; // address of the referrer if exists
        uint256 usdtIn; // amount of USDT player put in
        uint256 wbtcTicket; // amount of WBTC equal to 10 USDT
        uint256 quantity; // number of tickets
        // will be fulfilled after revealing
        bool fulfilled; // whether the request has been successfully fulfilled
        uint256 randomWord; // random word revealed
        uint256[] rewardLevels; // reward level of each ticket results
        uint256 xexpOut; // total amount of XEXP player will get
        uint256 wbtcOut; // total amount of WBTC player will get
        uint256 wbtcFee; // total amount of WBTC referrer will get
    }

    mapping(address => uint256[]) public address2RequestIds;
    mapping(uint256 => RequestStatus) public requestId2RequestStatus;
    mapping(address => uint256) public referrer2MillionthRatio;
    uint256[] public requestIds;
    uint256 public nextRequestId = 1;

    event SaveWBTC(uint256 amount_wbtc, uint256 amount_xbit, address player);
    event WithdrawWBTC(
        uint256 amount_xbit,
        uint256 amount_wbtc,
        address player
    );
    event SwapUSDT2WBTC(
        uint256 amount_usdt,
        uint256 amount_wbtc,
        address caller
    );
    event RegisterReferrer(address referrer, uint256 millionth_ratio);
    event RequestedRandomness(uint256 reqId, address invoker);
    event LotteryOutcome(uint256 reqId, RequestStatus status);

    // Uniswap variables
    IUniswapV2Router02 private immutable v2Router02;

    // === Basic functions ===
    constructor(
        address _addr_wbtc,
        address _addr_usdt,
        address _addr_xexp,
        address _addr_uniswapV2Router02
    ) ERC20("XbitV2", "XBIT") {
        _wbtc = ERC20(_addr_wbtc);
        _usdt = ERC20(_addr_usdt);
        _xexp = ERC20(_addr_xexp);
        v2Router02 = IUniswapV2Router02(_addr_uniswapV2Router02);
    }

    function setMaintainer(address new_maintainer) public onlyOwner {
        MAINTAINER_ADDRESS = new_maintainer;
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    // for testing purpose only
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    function save(uint256 amount_wbtc) public {
        if (amount_wbtc == 0) return;
        uint256 total_wbtc = _wbtc.balanceOf(address(this));
        uint256 total_xbit = this.totalSupply();
        uint256 zeros_wbtc = 10 ** _wbtc.decimals();
        uint256 zeros_xbit = 10 ** this.decimals();

        uint256 amount_xbit = 0;
        if (total_xbit == 0 || total_wbtc == 0) {
            // initialize wbtc-xbit pool
            amount_xbit = (amount_wbtc * zeros_xbit) / zeros_wbtc;
        } else {
            amount_xbit = (amount_wbtc * total_xbit) / total_wbtc;
        }

        _wbtc.transferFrom(msg.sender, address(this), amount_wbtc);
        _mint(msg.sender, amount_xbit);

        emit SaveWBTC(amount_wbtc, amount_xbit, msg.sender);
    }

    function withdraw(uint256 amount_xbit) public {
        uint256 total_wbtc = _wbtc.balanceOf(address(this));
        uint256 total_xbit = this.totalSupply();
        if (amount_xbit == 0 || total_xbit == 0) return;

        uint256 amount_wbtc = (amount_xbit * total_wbtc) / total_xbit;
        uint256 fee_wbtc = (amount_wbtc * WITHDRAW_FEE_MILLIONTH_RATIO) / 1e6;
        amount_wbtc -= fee_wbtc;

        burn(amount_xbit);
        _wbtc.approve(address(this), amount_wbtc + fee_wbtc);
        _wbtc.transferFrom(address(this), msg.sender, amount_wbtc);
        _wbtc.transferFrom(address(this), owner(), fee_wbtc);

        emit WithdrawWBTC(amount_xbit, amount_wbtc, msg.sender);
    }

    function register(uint256 millionth_ratio) public {
        require(millionth_ratio < 1e5, "referrer fee should be less than 10%");
        referrer2MillionthRatio[msg.sender] = millionth_ratio;

        emit RegisterReferrer(msg.sender, millionth_ratio);
    }

    function referrerRatio(address referrer) public view returns (uint256) {
        return referrer2MillionthRatio[referrer];
    }

    function swap(uint256 amount_usdt) public {
        require(
            msg.sender == MAINTAINER_ADDRESS || msg.sender == owner(),
            "only maintainer or owner can swap USDT to WBTC in contract pool"
        );

        amount_usdt = Math.min(amount_usdt, _usdt.balanceOf(address(this)));
        uint256 amount_wbtc = usdt2wbtc_v2(amount_usdt);
        emit SwapUSDT2WBTC(amount_usdt, amount_wbtc, msg.sender);
    }

    function rewardByRandom(
        uint256 wbtc_ticket,
        uint256 random_word
    )
        private
        view
        returns (uint256 reward_level, uint256 reward_xexp, uint256 reward_wbtc)
    {
        uint256 p = random_word % RAND_MAX;
        uint256 wbtc_amount_pool = _wbtc.balanceOf(address(this));
        uint256 usdt_value_pool = Math.max(
            (wbtc_amount_pool * 10) / wbtc_ticket,
            1e4
        );

        uint256 lv5plus = (RAND_MAX / usdt_value_pool) * 10; // < 0.1%
        uint256 lv4plus = lv5plus + RAND_MAX / 800; // +0.125%
        uint256 lv3plus = lv4plus + RAND_MAX / 20; // +5%
        uint256 lv2plus = lv3plus + RAND_MAX / 8; // +12.5%
        uint256 lv1plus = lv2plus + RAND_MAX / 4; // +25%

        if (p < lv5plus) {
            reward_level = 5;
            reward_wbtc = wbtc_amount_pool / 10;
        } else if (p < lv4plus) {
            reward_level = 4;
            reward_xexp = 0;
            reward_wbtc = wbtc_ticket * 100;
        } else if (p < lv3plus) {
            reward_level = 3;
            reward_xexp = 0;
            reward_wbtc = wbtc_ticket * 4;
        } else if (p < lv2plus) {
            reward_level = 2;
            reward_xexp = 0;
            reward_wbtc = wbtc_ticket * 2;
        } else if (p < lv1plus) {
            reward_level = 1;
            reward_xexp = 0;
            reward_wbtc = wbtc_ticket / 2;
        } else {
            reward_level = 0;
            reward_xexp = 100 * 10 ** _xexp.decimals();
            reward_wbtc = 0;
        }
    }

    function dice() public view returns (uint256) {
        // TEST ONLY: use unsafe onchain method
        return
            uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender)));
    }

    function unsafeLottery(
        uint256 amount_usdt,
        address referrer,
        uint256 random_word
    ) public returns (uint256 requestId) {
        TransferHelper.safeTransferFrom(
            address(_usdt),
            msg.sender,
            address(this),
            amount_usdt
        );

        requestId = preRandom(amount_usdt, referrer);

        random_word = random_word == 0 ? dice() : random_word;
        fulfillRandomWord(requestId, random_word);
    }

    function safeLottery(
        uint256 amount_usdt,
        address referrer
    ) public returns (uint256 requestId) {
        TransferHelper.safeTransferFrom(
            address(_usdt),
            msg.sender,
            address(this),
            amount_usdt
        );

        requestId = preRandom(amount_usdt, referrer);
    }

    function reveal(uint256 requestId) public {
        RequestStatus storage status = requestId2RequestStatus[requestId];
        require(status.exists, "invalid request");
        require(!status.fulfilled, "already fulfilled");
        require(status.player == msg.sender, "only player can reveal");
        require(
            status.initialBlock + 2 < block.number,
            "must wait at least 3 blocks to reveal"
        );
        require(
            block.number < status.initialBlock + 128,
            "expired since 128 blocks mined"
        );

        bytes32 blockHash = blockhash(
            status.initialBlock + 1 + (block.timestamp % 2)
        );

        uint256 randomWord = uint256(
            keccak256(
                abi.encodePacked(
                    requestId,
                    blockHash,
                    block.timestamp,
                    status.player
                )
            )
        );

        fulfillRandomWord(requestId, randomWord);
    }

    function preRandom(
        uint256 amount_usdt,
        address referrer
    ) internal returns (uint256 requestId) {
        uint256 zeros_usdt = 10 ** _usdt.decimals();
        uint256 quantity = amount_usdt / zeros_usdt / 10;

        requestId = nextRequestId;
        requestIds.push(requestId);
        nextRequestId += 1;

        address2RequestIds[msg.sender].push(requestId);
        requestId2RequestStatus[requestId] = RequestStatus({
            exists: true,
            requestId: requestId,
            initialBlock: block.number,
            player: msg.sender,
            referrer: referrer,
            usdtIn: amount_usdt,
            wbtcTicket: estimateUSDT2WBTC(10 * zeros_usdt),
            quantity: quantity,
            // will be fulfilled after revealing
            fulfilled: false, // TBD
            randomWord: 0, // TBD
            rewardLevels: new uint256[](0), // TBD
            xexpOut: 0, // TBD
            wbtcOut: 0, // TBD
            wbtcFee: 0 // TBD
        });

        emit RequestedRandomness(requestId, msg.sender);
    }

    function fulfillRandomWord(uint256 requestId, uint256 randomWord) internal {
        RequestStatus storage status = requestId2RequestStatus[requestId];
        require(status.exists, "invalid request");
        require(!status.fulfilled, "already fulfilled");

        uint256 amount_xexp = 0;
        uint256 amount_wbtc = 0;
        status.randomWord = randomWord;

        for (uint i = 0; i < status.quantity; i++) {
            uint256 reward_level = 0;
            uint256 reward_xexp = 0;
            uint256 reward_wbtc = 0;
            (reward_level, reward_xexp, reward_wbtc) = rewardByRandom(
                status.wbtcTicket,
                randomWord
            );
            amount_xexp += reward_xexp;
            amount_wbtc += reward_wbtc;
            status.rewardLevels.push(reward_level);
            randomWord = uint256(
                keccak256(abi.encodePacked(randomWord, status.player))
            );
        }

        // will be 0 if the referrer is not registered
        uint256 millionth_ratio = referrerRatio(status.referrer);
        uint256 wbtc_fee = (amount_wbtc * millionth_ratio) / 1e6;
        uint256 wbtc_out = amount_wbtc - wbtc_fee;

        status.xexpOut = amount_xexp;
        status.wbtcOut = wbtc_out;
        status.wbtcFee = wbtc_fee;
        status.fulfilled = true;

        reward(0, wbtc_fee, status.referrer);
        reward(amount_xexp, wbtc_out, status.player);

        emit LotteryOutcome(requestId, status);
    }

    function reward(
        uint256 amount_xexp,
        uint256 amount_wbtc,
        address receiver
    ) internal {
        if (amount_xexp > 0) {
            _xexp.approve(address(this), amount_xexp);
            _xexp.transferFrom(address(this), receiver, amount_xexp);
        }

        if (amount_wbtc > 0) {
            _wbtc.approve(address(this), amount_wbtc);
            _wbtc.transferFrom(address(this), receiver, amount_wbtc);
        }
    }

    function getRequestIdByAddress(
        address player
    ) public view returns (uint256[] memory) {
        return address2RequestIds[player];
    }

    function getRequestStatusById(
        uint256 requestId
    ) public view returns (RequestStatus memory) {
        return requestId2RequestStatus[requestId];
    }

    function usdt2wbtc_v2(uint amountIn) internal returns (uint amountOut) {
        // Approve the router to spend usdt.
        TransferHelper.safeApprove(
            address(_usdt),
            address(v2Router02),
            amountIn
        );

        // amountOutMin must be retrieved from an oracle of some kind
        uint[] memory amountOuts = v2Router02.swapExactTokensForTokens(
            amountIn,
            (estimateUSDT2WBTC(amountIn) * 3) / 4, // amountMin
            getPathForUSDT2WBTC(),
            address(this),
            block.timestamp + 60000 // roughly 1min
        );

        return amountOuts[amountOuts.length - 1];
    }

    function estimateUSDT2WBTC(uint amountIn) public view returns (uint) {
        uint[] memory amountOuts = v2Router02.getAmountsOut(
            amountIn,
            getPathForUSDT2WBTC()
        );
        return amountOuts[amountOuts.length - 1];
    }

    function getPathForUSDT2WBTC() internal view returns (address[] memory) {
        address[] memory path = new address[](2);
        path[0] = address(_usdt);
        path[1] = address(_wbtc);

        return path;
    }

    receive() external payable {}
}
