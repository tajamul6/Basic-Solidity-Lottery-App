const { ethers, network } = require("hardhat");
const fs = require("fs");

const FRONT_END_ADDRESSES_FILE =
  "../nextjs-smartcontract-lottery/constants/contractAddresses.json";
FRONT_END_ABI_FILE = "../nextjs-smartcontract-lottery/constants/abi.json";

module.exports = async function () {
  if (process.env.UPDATE_FRONT_END) {
    console.log("updating front end");
    updateContractAddresses();
    updateABI();
  }
};

async function updateABI() {
  const lottery = await ethers.getContract("Lottery");
  fs.writeFileSync(
    FRONT_END_ABI_FILE,
    lottery.interface.format(ethers.utils.FormatTypes.json)
  );
}

async function updateContractAddresses() {
  const lottery = await ethers.getContract("Lottery");
  const contractAddresses = JSON.parse(
    fs.readFileSync(FRONT_END_ADDRESSES_FILE, "utf8")
  );
  if (network.config.chainId.toString() in contractAddresses) {
    if (
      !contractAddresses[network.config.chainId.toString()].includes(
        lottery.address
      )
    ) {
      contractAddresses[network.config.chainId.toString()].push(
        lottery.address
      );
    }
  } else {
    contractAddresses[network.config.chainId.toString()] = [lottery.address];
  }
  fs.writeFileSync(FRONT_END_ADDRESSES_FILE, JSON.stringify(contractAddresses));
}

module.exports.tags = ["all", "frontend"];
