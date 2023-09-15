import { network, ethers } from "hardhat";
import { join } from "path";
import { readFileSync } from "fs";
import { ContractTransaction, ContractReceipt, Event } from "ethers";
import { erc20Abi, xbitAbi } from "../utils/constants";

const RAND_MAX = 2n ** 128n;
let parseUnits = ethers.utils.parseUnits;
let formatUnits = ethers.utils.formatUnits;

async function main() {
  if (network.name === "hardhat") {
    console.warn(
      "You are trying to interact with the Hardhat Network, which gets automatically created and destroyed every " +
        "time. Use the Hardhat option '--network localhost'"
    );
  }

  // get owner as user
  const [owner] = await ethers.getSigners();
  console.log(`Owner address: ${owner.address}`);
  console.log(`Network name: ${network.name}`);
  console.log(`Network chainId: ${(await ethers.provider.getNetwork()).chainId}`);
  console.log(`Network blockNumber: ${await ethers.provider.getBlockNumber()}`);

  // get addresses from cache
  let address_path = `../addresses/${network.name}.json`;
  const addresses = JSON.parse(readFileSync(join(__dirname, address_path)).toString());
  console.log("addresses:");
  console.log(addresses);

  let wbtc = new ethers.Contract(addresses["wbtc"], erc20Abi, owner);
  let usdt = new ethers.Contract(addresses["usdt"], erc20Abi, owner);
  let xexp = new ethers.Contract(addresses["xexp"], erc20Abi, owner);
  let xbit = new ethers.Contract(addresses["xbit"], xbitAbi, owner);

  const [wbtc_decimals, usdt_decimals, xexp_decimals, xbit_decimals] = await Promise.all([
    wbtc.decimals(),
    usdt.decimals(),
    xexp.decimals(),
    xbit.decimals(),
  ]);

  console.log("contract addresses:");
  console.log("wbtc:", wbtc.address, "decimals:", wbtc_decimals);
  console.log("usdt:", usdt.address, "decimals:", usdt_decimals);
  console.log("xexp:", xexp.address, "decimals:", xexp_decimals);
  console.log("xbit:", xbit.address, "decimals:", xbit_decimals);

  const tags = { gasLimit: 1000000 };

  async function get_balance(contract: any, address: string) {
    const [balance, decimals] = await Promise.all([contract.balanceOf(address), contract.decimals()]);
    return ethers.utils.formatUnits(balance, decimals);
  }

  async function get_supply(contract: any) {
    const [balance, decimals] = await Promise.all([contract.totalSupply(), contract.decimals()]);
    return ethers.utils.formatUnits(balance, decimals);
  }

  async function print_balances() {
    let [wbtc_b, usdt_b, xbit_b, wbtc_e, usdt_e, xbit_t] = await Promise.all([
      get_balance(wbtc, owner.address),
      get_balance(usdt, owner.address),
      get_balance(xbit, owner.address),
      get_balance(wbtc, xbit.address),
      get_balance(usdt, xbit.address),
      get_supply(xbit),
    ]);

    console.log(`balances: wbtc ${wbtc_b};\tusdt ${usdt_b};\txbit ${xbit_b}`);
    console.log(`exchange: wbtc ${wbtc_e};\tusdt ${usdt_e};\txbit ${xbit_t} (total)`);
  }

  console.log("=== initial status ===");
  await print_balances();
  let tx: ContractTransaction;
  let receipt: ContractReceipt;

  console.log("=== save ===");
  await wbtc.approve(xbit.address, 0);
  await wbtc.approve(xbit.address, parseUnits("0.28", wbtc_decimals));
  tx = await xbit.save(parseUnits("0.28", wbtc_decimals));
  receipt = await tx.wait();
  await print_balances();

  console.log("=== unsafe lottery ===");
  let cost = parseUnits("100", usdt_decimals);
  await usdt.approve(xbit.address, 0);
  await usdt.approve(xbit.address, cost);
  let randomWord = RAND_MAX / 4n;
  tx = await xbit.unsafeLottery(cost, owner.address, randomWord, tags);
  receipt = await tx.wait();
  await print_balances();
  let args = receipt.events!.filter((x: Event) => x.event === "LotteryOutcome")[0].args;
  console.log(args);

  console.log("=== withdraw ===");
  let rest = await xbit.balanceOf(owner.address);
  await xbit.approve(owner.address, 0);
  await xbit.approve(owner.address, rest);
  tx = await xbit.withdraw(rest);
  receipt = await tx.wait();
  await print_balances();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
