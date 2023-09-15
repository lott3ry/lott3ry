import { network, ethers } from "hardhat";
import { join } from "path";
import { readFileSync, writeFileSync } from "fs";
import { ContractTransaction, ContractReceipt, Event } from "ethers";
import { erc20Abi } from "../utils/constants";
let parseUnits = ethers.utils.parseUnits;
let formatUnits = ethers.utils.formatUnits;

async function main() {
  if (network.name === "hardhat") {
    console.warn(
      "You are trying to interact with the Hardhat Network, which gets automatically created and destroyed every " +
        "time. Use the Hardhat option '--network localhost'"
    );
  }

  const [owner] = await ethers.getSigners();
  console.log(`Owner address: ${owner.address}`);
  console.log(`Network name: ${network.name}`);
  console.log(`Network chainId: ${(await ethers.provider.getNetwork()).chainId}`);
  console.log(`Network blockNumber: ${await ethers.provider.getBlockNumber()}`);

  // get addresses from cache
  let address_path = `../addresses/${network.name}.json`;
  const addresses = JSON.parse(readFileSync(join(__dirname, address_path)).toString());
  console.log(addresses);

  let wbtc = new ethers.Contract(addresses["wbtc"], erc20Abi, owner);
  let usdt = new ethers.Contract(addresses["usdt"], erc20Abi, owner);
  const [wbtc_decimals, usdt_decimals] = await Promise.all([wbtc.decimals(), usdt.decimals()]);
  const uniswap_v2_factory = await ethers.getContractAt("UniswapV2Factory", addresses["UniswapV2Factory"]);
  const uniswap_v2_router02 = await ethers.getContractAt("UniswapV2Router02", addresses["UniswapV2Router02"]);

  // check pair address
  const pair_address = await uniswap_v2_factory.getPair(addresses["usdt"], addresses["wbtc"]);
  console.log("getPair:", pair_address);

  // check liquidity
  const ans = await uniswap_v2_router02.getAmountsOut(parseUnits("26000", usdt_decimals), [
    addresses["usdt"],
    addresses["wbtc"],
  ]);
  console.log("getAmountsOut:", ans);

  // test swap
  let usdt_amount = parseUnits("2600", usdt_decimals);
  await usdt.approve(uniswap_v2_router02.address, 0);
  await usdt.approve(uniswap_v2_router02.address, usdt_amount);
  let tx = await uniswap_v2_router02.swapExactTokensForTokens(
    usdt_amount,
    0,
    [addresses["usdt"], addresses["wbtc"]],
    owner.address,
    2n ** 256n - 1n
  );
  let receipt = await tx.wait();
  console.log("swapExactTokensForTokens:", receipt);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
