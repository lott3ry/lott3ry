import { BigNumber, Event, Contract } from "ethers";
import { expect } from "chai";
import { network, ethers } from "hardhat";
let parseUnits = ethers.utils.parseUnits;
let formatUnits = ethers.utils.formatUnits;
let getAddress = ethers.utils.getAddress;
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { erc20Abi, xbitAbi } from "../utils/constants";

const RAND_MAX = 2n ** 128n;
const INIT_XBIT = "0.025";
const SUB_ID = 1;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"; // mainnet
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // mainnet
const WBTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"; // mainnet
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // mainnet
const ROUTER_V2_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // mainnet
const ROUTER_V3_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // mainnet

describe("Xbit", function () {
  let owner: any, addr1: any, addr2: any;
  let weth: Contract, wbtc: Contract, usdt: Contract, xexp: Contract, xbit: Contract, simpleSwap: Contract;

  let wbtc_decimals: BigNumber, usdt_decimals: BigNumber, xbit_decimals: BigNumber, xexp_decimals: BigNumber;

  const tags = { gasLimit: 3000000 };

  beforeEach(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();

    weth = new ethers.Contract(WETH_ADDRESS, erc20Abi, owner);
    wbtc = new ethers.Contract(WBTC_ADDRESS, erc20Abi, owner);
    usdt = new ethers.Contract(USDT_ADDRESS, erc20Abi, owner);

    xexp = await (await ethers.getContractFactory("Xexp")).deploy();

    xbit = await (
      await ethers.getContractFactory("Xbit")
    ).deploy(WBTC_ADDRESS, USDT_ADDRESS, xexp.address, ROUTER_V2_ADDRESS);
    await xbit.deployed();

    simpleSwap = await (await ethers.getContractFactory("SimpleSwap")).deploy(ROUTER_V3_ADDRESS);
    await simpleSwap.deployed();

    // initialize account
    await setBalance(owner.address, 1000000n * 10n ** 18n);
    const ether1000 = ethers.utils.parseEther("1000");
    await (await weth.deposit({ value: ether1000.toBigInt() * 10n })).wait();
    await weth.approve(simpleSwap.address, ether1000);
    await (await simpleSwap.swapWETHForUSDT(ether1000, tags)).wait();
    await weth.approve(simpleSwap.address, ether1000);
    await (await simpleSwap.swapWETHForWBTC(ether1000, tags)).wait();

    [wbtc_decimals, usdt_decimals, xbit_decimals, xexp_decimals] = await Promise.all([
      wbtc.decimals(),
      usdt.decimals(),
      xbit.decimals(),
      xexp.decimals(),
    ]);

    await xexp.mint(xbit.address, parseUnits("10000000000", xexp_decimals));

    // prepare WBTC pool
    let amount_wbtc = parseUnits("10", wbtc_decimals);
    await wbtc.approve(xbit.address, amount_wbtc);
    await (await xbit.save(amount_wbtc)).wait();
  });

  describe("unsafeLottery", function () {
    it("unsafeLottery() should work", async function () {
      // lottery for twice
      let amount_usdt = parseUnits("20", usdt_decimals);
      // console.log("amount_usdt = ", amount_usdt);
      await usdt.approve(xbit.address, 0);
      await usdt.approve(xbit.address, amount_usdt);
      let tx = await xbit.unsafeLottery(amount_usdt, addr2.address, 0, tags);
      let events = (await tx.wait()).events;
      let status = events.filter((x: Event) => x.event === "LotteryOutcome")[0].args.status;
      let ticket_wbtc = await xbit.estimateUSDT2WBTC(parseUnits("10", usdt_decimals));

      // check LotteryOutcome status
      expect(status.exists).to.true;
      expect(status.fulfilled).to.true;
      expect(status.player).to.be.equal(owner.address);
      expect(status.referrer).to.be.equal(addr2.address);
      expect(status.usdtIn).to.be.equal(amount_usdt);
      expect(status.wbtcTicket).to.be.equal(ticket_wbtc);
      expect(status.quantity).to.be.equal(2);
      expect(status.rewardLevels.length).to.be.equal(2);

      // the others are random
      // console.log(status);
    });

    it("unsafeLottery() should reward fixed amount of xexp", async function () {
      // lottery for level 0
      let amount_usdt = parseUnits("10", usdt_decimals);
      await usdt.approve(xbit.address, 0);
      await usdt.approve(xbit.address, amount_usdt);
      let randomWord = RAND_MAX / 2n;
      let tx = await xbit.unsafeLottery(amount_usdt, addr2.address, randomWord, tags);
      let events = (await tx.wait()).events;
      let status = events.filter((x: Event) => x.event === "LotteryOutcome")[0].args.status;

      // check LotteryOutcome status
      expect(status.xexpOut).to.be.equal(parseUnits("100", xexp_decimals)); // 100 xexp reward
      expect(status.wbtcOut).to.be.equal(0);
      expect(status.wbtcFee).to.be.equal(0);
      expect(status.randomWord).to.be.equal(randomWord);
      expect(status.rewardLevels[0]).to.be.equal(0);
    });

    it("unsafeLottery() should reward fixed amount of wbtc", async function () {
      // lottery for level 1
      let amount_usdt = parseUnits("10", usdt_decimals);
      await usdt.approve(xbit.address, 0);
      await usdt.approve(xbit.address, amount_usdt);
      let randomWord = RAND_MAX / 4n;
      let tx = await xbit.unsafeLottery(amount_usdt, addr2.address, randomWord, tags);
      let events = (await tx.wait()).events;
      let status = events.filter((x: Event) => x.event === "LotteryOutcome")[0].args.status;

      // check LotteryOutcome status
      expect(status.xexpOut).to.be.equal(0);
      expect(status.wbtcOut).to.be.equal(Math.floor(status.wbtcTicket / 2)); // half ticket reward
      expect(status.wbtcFee).to.be.equal(0);
      expect(status.randomWord).to.be.equal(randomWord);
      expect(status.rewardLevels[0]).to.be.equal(1);
    });

    it("unsafeLottery() should reward 10% wbtc pool", async function () {
      // lottery for level 5
      let amount_wbtc = parseUnits("10", wbtc_decimals);
      let amount_usdt = parseUnits("10", usdt_decimals);
      await usdt.approve(xbit.address, 0);
      await usdt.approve(xbit.address, amount_usdt);
      let randomWord = 1n;
      let tx = await xbit.unsafeLottery(amount_usdt, addr2.address, randomWord, tags);
      let events = (await tx.wait()).events;
      let status = events.filter((x: Event) => x.event === "LotteryOutcome")[0].args.status;

      // check LotteryOutcome status
      expect(status.xexpOut).to.be.equal(0);
      expect(status.wbtcOut).to.be.equal(amount_wbtc.toBigInt() / 10n); // 10% wbtc pool reward
      expect(status.wbtcFee).to.be.equal(0);
      expect(status.randomWord).to.be.equal(randomWord);
      expect(status.rewardLevels[0]).to.be.equal(5);
    });

    it("unsafeLottery() should be random", async function () {
      // lottery for 10 tickets, 10 times
      let amount_usdt = parseUnits("100", usdt_decimals);
      let levels = [];
      for (let i = 0; i < 10; i++) {
        await usdt.approve(xbit.address, 0);
        await usdt.approve(xbit.address, amount_usdt);

        let tx = await xbit.unsafeLottery(amount_usdt, addr2.address, 0, tags);
        let events = (await tx.wait()).events;
        let status = events.filter((x: Event) => x.event === "LotteryOutcome")[0].args.status;
        levels.push(status.rewardLevels);
      }

      // check LotteryOutcome status
      levels = levels.flat().map((x: BigNumber) => x.toNumber());
      // console.log("rewardLevels: ", levels);
      expect(levels.length).to.be.equal(100);
      expect(levels.filter((x: number) => x == 0).length).to.be.greaterThan(30);
      expect(levels.filter((x: number) => x == 1).length).to.be.greaterThan(10);
      expect(levels.filter((x: number) => x == 2).length).to.be.greaterThan(0);
      expect(levels.filter((x: number) => x == 3).length).to.be.greaterThan(0);
    });

    it("getRequestIdByAddress() should work", async function () {
      // lottery for 10 tickets, 10 times
      let amount_usdt = parseUnits("100", usdt_decimals);
      let statuses = [];
      for (let i = 0; i < 10; i++) {
        await usdt.approve(xbit.address, 0);
        await usdt.approve(xbit.address, amount_usdt);

        let tx = await xbit.unsafeLottery(amount_usdt, addr2.address, 0, tags);
        let events = (await tx.wait()).events;
        let status = events.filter((x: Event) => x.event === "LotteryOutcome")[0].args.status;
        statuses.push(status);
      }

      let requestIds = await xbit.getRequestIdByAddress(owner.address);

      for (let i = 0; i < 10; i++) {
        expect(statuses[i].requestId).to.be.equal(requestIds[i]);
      }
    });

    it("getRequestStatusById() should work", async function () {
      let amount_usdt = parseUnits("100", usdt_decimals);

      await usdt.approve(xbit.address, 0);
      await usdt.approve(xbit.address, amount_usdt);

      let tx = await xbit.unsafeLottery(amount_usdt, addr2.address, 0, tags);
      let events = (await tx.wait()).events;
      let status = events.filter((x: Event) => x.event === "LotteryOutcome")[0].args.status;

      let statusById = await xbit.getRequestStatusById(status.requestId);

      expect(status).to.be.deep.equal(statusById);
    });
  });
});
