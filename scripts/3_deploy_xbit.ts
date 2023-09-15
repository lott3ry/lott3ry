import { network, ethers } from "hardhat";
import { join } from "path";
import { readFileSync, writeFileSync } from "fs";
let parseUnits = ethers.utils.parseUnits;
let formatUnits = ethers.utils.formatUnits;
import { erc20Abi, xbitAbi } from "../utils/constants";

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
  addresses["xbit"] = "TBD";

  const xbit = await (
    await ethers.getContractFactory("Xbit")
  ).deploy(addresses["wbtc"], addresses["usdt"], addresses["xexp"], addresses["UniswapV2Router02"]);

  await xbit.deployed();
  console.log(`Xbit deployed to ${xbit.address}`);
  addresses["xbit"] = xbit.address;

  let xexp = new ethers.Contract(addresses["xexp"], erc20Abi, owner);
  await xexp.mint(xbit.address, parseUnits("10000000000", await xexp.decimals()));

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
