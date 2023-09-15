import { network, ethers } from "hardhat";
import { join } from "path";
import { readFileSync, writeFileSync } from "fs";
import { ContractTransaction, ContractReceipt, Event } from "ethers";
let parseUnits = ethers.utils.parseUnits;

const BASE_FEE = "100000000000000000";
const GAS_PRICE_LINK = "1000000000"; // 0.000000001 LINK per gas

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

  const usdt = await (await ethers.getContractFactory("FakeUSDT")).deploy();
  await usdt.deployed();
  console.log(`USDT deployed to ${usdt.address}`);

  const wbtc = await (await ethers.getContractFactory("FakeWBTC")).deploy();
  await wbtc.deployed();
  console.log(`WBTC deployed to ${wbtc.address}`);

  const xexp = await (await ethers.getContractFactory("Xexp")).deploy();
  await xexp.deployed();
  console.log(`Xexp deployed to ${xexp.address}`);

  const uniswap_v2_factory = await (await ethers.getContractFactory("UniswapV2Factory")).deploy(owner.address);
  await uniswap_v2_factory.deployed();
  console.log(`UniswapV2Factory deployed to ${uniswap_v2_factory.address}`);

  const weth9 = await (await ethers.getContractFactory("WETH9")).deploy();
  await weth9.deployed();
  console.log(`weth deployed to ${weth9.address}`);

  const uniswap_v2_library = await (await ethers.getContractFactory("UniswapV2Library")).deploy();
  await uniswap_v2_library.deployed();
  console.log(`UniswapV2Library deployed to ${uniswap_v2_library.address}`);

  const uniswap_v2_router02 = await (
    await ethers.getContractFactory("UniswapV2Router02")
  ).deploy(uniswap_v2_factory.address, weth9.address);
  await uniswap_v2_router02.deployed();
  console.log(`UniswapV2Router02 deployed to ${uniswap_v2_router02.address}`);

  addresses["usdt"] = usdt.address;
  addresses["wbtc"] = wbtc.address;
  addresses["xexp"] = xexp.address;
  addresses["UniswapV2Factory"] = uniswap_v2_factory.address;
  addresses["weth"] = weth9.address;
  addresses["UniswapV2Library"] = uniswap_v2_library.address;
  addresses["UniswapV2Router02"] = uniswap_v2_router02.address;

  // create USDT-WBTC pair
  let tx: ContractTransaction;
  let receipt: ContractReceipt;

  const [wbtc_decimals, usdt_decimals] = await Promise.all([wbtc.decimals(), usdt.decimals()]);

  tx = await uniswap_v2_factory.createPair(addresses["usdt"], addresses["wbtc"]);
  receipt = await tx.wait();
  let args = receipt.events!.filter((x: Event) => x.event === "PairCreated")[0].args;
  console.log("PairCreated:", args);

  // check pair address
  const pair_address = await uniswap_v2_factory.getPair(addresses["usdt"], addresses["wbtc"]);
  receipt = await tx.wait();
  console.log("getPair:", pair_address);

  // add liquidity to USDT-WBTC pair
  // assume 26000 USDT = 1 BTC, deposit 260000000 USDT and 10000 WBTC
  let usdt_amount = parseUnits("260000000", usdt_decimals);
  let wbtc_amount = parseUnits("10000", wbtc_decimals);
  await usdt.mint(owner.address, usdt_amount);
  await wbtc.mint(owner.address, wbtc_amount);
  console.log("mint done");
  await usdt.approve(uniswap_v2_router02.address, 0);
  await usdt.approve(uniswap_v2_router02.address, usdt_amount);
  await wbtc.approve(uniswap_v2_router02.address, 0);
  await wbtc.approve(uniswap_v2_router02.address, wbtc_amount);
  console.log("approve done");
  tx = await uniswap_v2_router02.addLiquidity(
    usdt.address,
    wbtc.address,
    usdt_amount,
    wbtc_amount,
    0,
    0,
    owner.address,
    2n ** 256n - 1n
  );
  receipt = await tx.wait();
  console.log("addLiquidity done");

  // write addresses to cache
  writeFileSync(join(__dirname, address_path), JSON.stringify(addresses, undefined, 2), {
    flag: "w",
  });
  console.log(`addresses wrote to ${address_path}:`);
  console.log(addresses);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
