const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery Unit Tests", function () {
      let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval;
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
      describe("constructor", function () {
        it("initializes the lottery correctly", async function () {
          const raffleState = await lottery.getRaffleState();
          assert.equal(raffleState.toString(), "0");
          assert.equal(raffleState.toString(), "0");
          assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
        });
      });

      describe("enterLottery", function () {
        it("reverts when you don't pay enough", async function () {
          await expect(lottery.enterLottery()).to.be.revertedWith(
            "Lottery__NotEnoughETHEntered"
          );
        });
        it("records players when they enter the Lottery", async function () {
          await lottery.enterLottery({
            value: lotteryEntranceFee,
          });
          const playerFromContract = await lottery.getPlayer(0);
          assert.equal(playerFromContract, deployer);
        });
        it("emits event on enter", async function () {
          await expect(
            lottery.enterLottery({
              value: lotteryEntranceFee,
            })
          ).to.emit(lottery, "LotteryEnter");
        });
        it("doesnt allow entrance when lottery is calculating", async function () {
          await lottery.enterLottery({
            value: lotteryEntranceFee,
          });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);

          //We pretend to be a Chainlink Keeper
          await lottery.performUpkeep([]);
          await expect(
            lottery.enterLottery({
              value: lotteryEntranceFee,
            })
          ).to.be.revertedWith("Lottery__NotOpen");
        });
      });
      describe("checkUpkeep", function () {
        it("returns false if no eth was sent", async function () {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        });
        it("returns false if lottery isn't open", async function () {
          await lottery.enterLottery({
            value: lotteryEntranceFee,
          });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);

          await network.provider.send("evm_mine", []);
          await lottery.performUpkeep([]);
          const raffleState = await lottery.getRaffleState();
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert.equal(raffleState.toString(), "1");
          assert.equal(upkeepNeeded, false);
        });
        it("returns false if enough time hasn't passed", async function () {
          await lottery.enterLottery({
            value: lotteryEntranceFee,
          });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() - 1,
          ]);
          await network.provider.send("evm_mine", []);
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        });
        it("returns true if enough time has passed, has players, eth, and is also open", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert(upkeepNeeded);
        });
      });
      describe("performUpkeep", function () {
        it("can only run if checkupkeep is true", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const tx = await lottery.performUpkeep([]);
          assert(tx);
        });
        it("reverts when checkupkeep is false", async function () {
          await expect(lottery.performUpkeep([])).to.be.revertedWith(
            "Lottery__UpkeepNotNeeded"
          );
        });
        it("updates the raffleState, emits an event, and calls the vrf coordinator", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const txResponse = await lottery.performUpkeep([]);
          const txReceipt = await txResponse.wait(1);
          const requestId = txReceipt.events[1].args.requestId;
          const raffleState = await lottery.getRaffleState();
          assert(requestId.toNumber() > 0);
          assert(raffleState.toString() == "1");
        });
      });

      describe("fulfillRandomWords", function () {
        beforeEach(async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
        });
        it("can only be called after performUpkeep", async function () {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
          ).to.be.revertedWith("nonexistent request");
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)
          ).to.be.revertedWith("nonexistent request");
        });

        it("picks a winner, resets the lottery, and sends money", async function () {
          const additionalEntrants = 3;
          const startingAccountIndex = 1;
          const accounts = await ethers.getSigners();
          for (
            let i = startingAccountIndex;
            i < startingAccountIndex + additionalEntrants;
            i++
          ) {
            const accountConnectedRaffle = lottery.connect(accounts[i]);
            await accountConnectedRaffle.enterLottery({
              value: lotteryEntranceFee,
            });
          }
          const startingTimeStamp = await lottery.getLatestTimeStamp();

          await new Promise(async (resolve, reject) => {
            lottery.once("WinnerPicked", async () => {
              console.log("Found the event");
              try {
                // console.log(accounts[2].address);
                // console.log(accounts[0].address);
                // console.log(accounts[1].address);
                // console.log(accounts[3].address);
                const recentWinner = await lottery.getRecentWinner();
                // console.log(recentWinner);
                const raffleState = await lottery.getRaffleState();
                const endingTimeStamp = await lottery.getLatestTimeStamp();
                const numPlayers = await lottery.getNumberOfPlayers();
                const winnerEndingBalance = await accounts[1].getBalance();
                assert.equal(numPlayers.toString(), "0");
                assert.equal(raffleState.toString(), "0");
                assert(endingTimeStamp > startingTimeStamp);

                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(
                    lotteryEntranceFee
                      .mul(additionalEntrants)
                      .add(lotteryEntranceFee)
                      .toString()
                  )
                );
              } catch (e) {
                reject(e);
              }
              resolve();
            });
            const tx = await lottery.performUpkeep([]);
            const txReceipt = await tx.wait(1);
            const winnerStartingBalance = await accounts[1].getBalance();
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              lottery.address
            );
          });
        });
      });
    });
