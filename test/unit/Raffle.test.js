const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-config");

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery Unit Tests", async function () {
          let lottery,
              vrfCoordinatorV2Mock,
              lotteryEntranceFee,
              deployer,
              interval;
          const chainId = network.config.chainId;
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer;
              await deployments.fixture(["all"]);
              lottery = await ethers.getContract("Lottery", deployer);
              vrfCoordinatorV2Mock = await ethers.getContract(
                  "VRFCoordinatorV2Mock",
                  deployer
              );
              lotteryEntranceFee = await lottery.getEntranceFee();
              interval = await lottery.getInterval();
          });
          describe("constructor", async function () {
              it("initializes the lottery correctly", async function () {
                  const raffleState = await lottery.getRaffleState();
                  assert.equal(raffleState.toString(), "0");
                  assert.equal(raffleState.toString(), "0");
                  assert.equal(
                      interval.toString(),
                      networkConfig[chainId]["interval"]
                  );
              });
          });

          describe("enterLottery", async function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(lottery.enterLottery()).to.be.revertedWith(
                      "Lottery__NotEnoughETHEntered"
                  );
              });
              it("records players when they enter the Lottery", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee });
                  const playerFromContract = await lottery.getPlayer(0);
                  assert.equal(playerFromContract, deployer);
              });
              it("emits event on enter", async function () {
                  await expect(
                      lottery.enterLottery({ value: lotteryEntranceFee })
                  ).to.emit(lottery, "LotteryEnter");
              });
              it("doesnt allow entrance when lottery is calculating", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.send("evm_mine", []);

                  //We pretend to be a Chainlink Keeper
                  await lottery.performUpkeep([]);
                  await expect(
                      lottery.enterLottery({ value: lotteryEntranceFee })
                  ).to.be.revertedWith("Lottery__NotOpen");
              });
          });
      });
