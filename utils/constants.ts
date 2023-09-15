// useful ABIs only
export const erc20Abi = [
  // Read-Only Functions
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  // Authenticated Functions
  "function transfer(address to, uint amount) returns (bool)",
  "function deposit() public payable",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount) public",
];

export const xbitAbi = [
  // # Xbit inherits from ERC20
  ...erc20Abi,
  // owner of Xbit contract can set maintainer
  "function setMaintainer(address new_maintainer) public",
  // owner and maintainer can trigger pool swap from USDT to WBTC
  // EMIT event SwapUSDT2WBTC
  "function swap(uint256 amount_usdt) public",
  // save WBTC to Xbit contract pool
  // EMIT event SaveWBTC
  "function save(uint256 amount_wbtc) public",
  // withdraw WBTC from Xbit contract pool, with a withdraw fee
  // EMIT event WithdrawWBTC
  "function withdraw(uint256 amount_xbit) public",
  // caller can register self as a referrer, with a ratio of 1/1000000
  // EMIT event RegisterReferrer
  "function register(uint256 millionth_ratio) public",
  // get referrer ratio of 1/1000000, default is 0 if not registered
  "function referrerRatio(address referrer) public view returns (uint256)",
  // run an unsafe lottery with pre-defined or internal random word
  // EMIT event RequestedRandomness, event LotteryOutcome
  "function unsafeLottery(uint256 amount_usdt, address referrer, uint256 random_word) public returns (uint256 requestId)",
  // run the first step of a safe lottery: draw
  // EMIT event RequestedRandomness
  "function safeLottery(uint256 amount_usdt, address referrer) public returns (uint256 requestId)",
  // run the second step of a safe lottery: reveal
  // EMIT event LotteryOutcome
  "function reveal(uint256 requestId) public",
  // get lottery request ids by address
  "function getRequestIdByAddress(address player) public view returns (uint256[] memory)",
  // get lottery request status by id
  "function getRequestStatusById(uint256 requestId) public view returns (tuple(bool exists, uint256 requestId, uint256 initialBlock, address player, address referrer, uint256 usdtIn, uint256 wbtcTicket, uint256 quantity, bool fulfilled, uint256 randomWord, uint256[] rewardLevels, uint256 xexpOut, uint256 wbtcOut, uint256 wbtcFee) memory)",
  // estimate WBTC amount by USDT amount using uniswap v2
  "function estimateUSDT2WBTC(uint amountIn) public view returns (uint)",
  // events
  "event SaveWBTC(uint256 amount_wbtc, uint256 amount_xbit, address player)",
  "event WithdrawWBTC(uint256 amount_xbit, uint256 amount_wbtc, address player)",
  "event SwapUSDT2WBTC(uint256 amount_usdt, uint256 amount_wbtc, address caller)",
  "event RegisterReferrer(address referrer, uint256 millionth_ratio)",
  "event RequestedRandomness(uint256 reqId, address invoker)",
  "event LotteryOutcome(uint256 reqId, tuple(bool exists, uint256 requestId, uint256 initialBlock, address player, address referrer, uint256 usdtIn, uint256 wbtcTicket, uint256 quantity, bool fulfilled, uint256 randomWord, uint256[] rewardLevels, uint256 xexpOut, uint256 wbtcOut, uint256 wbtcFee) status)",
];
