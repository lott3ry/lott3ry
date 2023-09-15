import { network, ethers } from "hardhat";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";

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
  let file = join(__dirname, address_path);
  let addresses = {};
  if (!existsSync(file)) {
    console.log("Addresses file not found");
    writeFileSync(file, JSON.stringify(addresses, undefined, 2), { flag: "w" });
  } else {
    addresses = JSON.parse(readFileSync(join(__dirname, address_path)).toString());
  }

  console.log(addresses);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
