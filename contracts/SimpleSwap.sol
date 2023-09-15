// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.9;
pragma abicoder v2;

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

contract SimpleSwap {
    ISwapRouter public immutable swapRouter;
    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address public constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    uint24 public constant feeTier = 3000;

    constructor(ISwapRouter _swapRouter) {
        swapRouter = _swapRouter;
    }

    function swapA2B(
        uint amountIn,
        address A,
        address B
    ) internal returns (uint256 amountOut) {
        // Transfer the specified amount of A to this contract.
        TransferHelper.safeTransferFrom(A, msg.sender, address(this), amountIn);
        // Approve the router to spend A.
        TransferHelper.safeApprove(A, address(swapRouter), amountIn);
        // Create the params that will be used to execute the swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: A,
                tokenOut: B,
                fee: feeTier,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
        // The call to `exactInputSingle` executes the swap.
        amountOut = swapRouter.exactInputSingle(params);
        return amountOut;
    }

    function swapWETHForDAI(
        uint amountIn
    ) external returns (uint256 amountOut) {
        return swapA2B(amountIn, WETH9, DAI);
    }

    function swapWETHForUSDT(
        uint amountIn
    ) external returns (uint256 amountOut) {
        return swapA2B(amountIn, WETH9, USDT);
    }

    function swapWETHForWBTC(
        uint amountIn
    ) external returns (uint256 amountOut) {
        return swapA2B(amountIn, WETH9, WBTC);
    }
}
