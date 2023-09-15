import { BigNumber, Event, Contract } from "ethers";
import { expect } from "chai";
import { network, ethers } from "hardhat";
let parseUnits = ethers.utils.parseUnits;
let formatUnits = ethers.utils.formatUnits;
let getAddress = ethers.utils.getAddress;
import { setBalance, mine } from "@nomicfoundation/hardhat-network-helpers";
import { erc20Abi, xbitAbi } from "../utils/constants";

const RAND_MAX = 2n ** 128n;
const INIT_XBIT = "0.025";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"; // mainnet
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // mainnet
const WBTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"; // mainnet
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // mainnet
const ROUTER_V2_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // mainnet
const ROUTER_V3_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // mainnet

describe("Xbit", function () {
  let owner: any, addr1: any, addr2: any;
  let wbtc: Contract, usdt: Contract, xexp: Contract, xbit: Contract, xabi: Contract, simpleSwap: Contract;

  let wbtc_decimals: BigNumber, usdt_decimals: BigNumber, xbit_decimals: BigNumber, xexp_decimals: BigNumber;

  const tags = { gasLimit: 3000000 };

  beforeEach(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();

    let weth = new ethers.Contract(WETH_ADDRESS, erc20Abi, owner);
    wbtc = new ethers.Contract(WBTC_ADDRESS, erc20Abi, owner);
    usdt = new ethers.Contract(USDT_ADDRESS, erc20Abi, owner);

    xexp = await (await ethers.getContractFactory("Xexp")).deploy();
    await xexp.deployed();

    xbit = await (
      await ethers.getContractFactory("Xbit")
    ).deploy(WBTC_ADDRESS, USDT_ADDRESS, xexp.address, ROUTER_V2_ADDRESS);
    await xbit.deployed();

    simpleSwap = await (await ethers.getContractFactory("SimpleSwap")).deploy(ROUTER_V3_ADDRESS);
    await simpleSwap.deployed();

    // initialize accounts
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

    xabi = new ethers.Contract(xbit.address, xbitAbi, owner);
  });

  describe("safeLottery", function () {
    it("safeLottery() should work", async function () {
      let amount_usdt = parseUnits("20", usdt_decimals);
      await usdt.approve(xbit.address, 0);
      await usdt.approve(xbit.address, amount_usdt);
      await expect(xbit.safeLottery(amount_usdt, addr2.address, tags)).to.emit(xbit, "RequestedRandomness");
    });

    it("reveal() should fail in some cases", async function () {
      let amount_usdt = parseUnits("20", usdt_decimals);
      await usdt.approve(xbit.address, 0);
      await usdt.approve(xbit.address, amount_usdt);
      let tx = await xbit.safeLottery(amount_usdt, addr2.address, tags);
      let events = (await tx.wait()).events;
      let requestId = events.filter((x: Event) => x.event === "RequestedRandomness")[0].args.reqId;

      // wait for 0 blocks
      for (let i = 0; i < 2; i++) {
        await expect(xbit.reveal(requestId)).to.be.revertedWith("must wait at least 3 blocks to reveal");
        // wait for 1 blocks
        await mine(1);
      }

      // expect failure: reveal with non-exist requestId
      await expect(xbit.reveal(250)).to.be.revertedWith("invalid request");

      // expect failure: reveal with a wrong sender
      await expect(xbit.connect(addr1).reveal(requestId)).to.be.revertedWith("only player can reveal");

      // reveal it!
      await (await xbit.reveal(requestId)).wait();

      // expect failure: reveal a revealed requestId
      await expect(xbit.reveal(requestId)).to.be.revertedWith("already fulfilled");
    });

    it("reveal() should work", async function () {
      let amount_usdt = parseUnits("20", usdt_decimals);
      await usdt.approve(xbit.address, 0);
      await usdt.approve(xbit.address, amount_usdt);
      let tx = await xbit.safeLottery(amount_usdt, addr2.address, tags);
      let events = (await tx.wait()).events;
      let requestId = events.filter((x: Event) => x.event === "RequestedRandomness")[0].args.reqId;

      // wait for 3 blocks
      await mine(3);

      // manually trigger callback
      let tx_callback = await xbit.reveal(requestId);
      let events_callback = (await tx_callback.wait()).events;

      // const xbit_interface = new ethers.utils.Interface(xbitV2Abi);
      let status = events_callback.filter((x: Event) => x.event === "LotteryOutcome")[0].args.status;
      // console.log(status);
      let ticket_wbtc = await xbit.estimateUSDT2WBTC(parseUnits("10", usdt_decimals));

      // check LotteryOutcome status
      expect(status.exists).to.true;
      expect(status.requestId).to.be.equal(requestId);
      expect(status.initialBlock).to.be.equal(tx.blockNumber);
      expect(status.player).to.be.equal(owner.address);
      expect(status.referrer).to.be.equal(addr2.address);
      expect(status.usdtIn).to.be.equal(amount_usdt);
      expect(status.wbtcTicket).to.be.equal(ticket_wbtc);
      expect(status.quantity).to.be.equal(2);

      expect(status.fulfilled).to.true;
      expect(status.rewardLevels.length).to.be.equal(2);
    });
  });

  describe("xbitAbi", function () {
    it("setMaintainer() should work", async function () {
      await (await xabi.setMaintainer(addr1.address)).wait();
    });

    it("swap() should work", async function () {
      let amount_usdt = parseUnits("1000", usdt_decimals).toBigInt();
      await usdt.approve(xabi.address, 0); // non-standard for usdt only
      await usdt.approve(xabi.address, amount_usdt);
      await usdt.transfer(xabi.address, amount_usdt);
      await (await xabi.swap(amount_usdt)).wait();
    });

    it("save() and withdraw() should work", async function () {
      let amount_wbtc = parseUnits(INIT_XBIT, wbtc_decimals).toBigInt();
      let amount_xbit = parseUnits(INIT_XBIT, xbit_decimals).toBigInt();
      await wbtc.approve(xabi.address, amount_wbtc);
      await (await xabi.save(amount_wbtc)).wait();

      await xabi.approve(owner.address, amount_xbit / 2n);
      await (await xabi.withdraw(amount_xbit / 2n)).wait();
    });

    it("register() and referrerRatio() should work", async function () {
      await (await xabi.connect(addr1).register(1234)).wait();
      expect(await xabi.referrerRatio(addr1.address)).to.equal(1234);
    });

    it("unsafeLottery() should work", async function () {
      let amount_usdt = parseUnits("20", usdt_decimals);
      await usdt.approve(xabi.address, 0);
      await usdt.approve(xabi.address, amount_usdt);
      let tx = await xabi.unsafeLottery(amount_usdt, addr2.address, 0, tags);
      let events = (await tx.wait()).events;
      let status = events.filter((x: Event) => x.event === "LotteryOutcome")[0].args.status;
      let ticket_wbtc = await xabi.estimateUSDT2WBTC(parseUnits("10", usdt_decimals));

      // check LotteryOutcome status
      expect(status.exists).to.true;
      expect(status.fulfilled).to.true;
      expect(status.player).to.be.equal(owner.address);
      expect(status.referrer).to.be.equal(addr2.address);
      expect(status.usdtIn).to.be.equal(amount_usdt);
      expect(status.wbtcTicket).to.be.equal(ticket_wbtc);
      expect(status.quantity).to.be.equal(2);
      expect(status.rewardLevels.length).to.be.equal(2);
    });

    it("safeLottery() and reveal() should work", async function () {
      let amount_usdt = parseUnits("20", usdt_decimals);
      await usdt.approve(xabi.address, 0);
      await usdt.approve(xabi.address, amount_usdt);
      let tx = await xabi.safeLottery(amount_usdt, addr2.address, tags);
      let events = (await tx.wait()).events;
      let requestId = events.filter((x: Event) => x.event === "RequestedRandomness")[0].args.reqId;

      // wait for 3 blocks
      await mine(3);

      // manually trigger callback
      let tx_callback = await xabi.reveal(requestId);
      let events_callback = (await tx_callback.wait()).events;

      // const xbit_interface = new ethers.utils.Interface(xbitV2Abi);
      let status = events_callback.filter((x: Event) => x.event === "LotteryOutcome")[0].args.status;
      let ticket_wbtc = await xabi.estimateUSDT2WBTC(parseUnits("10", usdt_decimals));

      // check LotteryOutcome status
      expect(status.exists).to.true;
      expect(status.requestId).to.be.equal(requestId);
      expect(status.initialBlock).to.be.equal(tx.blockNumber);
      expect(status.player).to.be.equal(owner.address);
      expect(status.referrer).to.be.equal(addr2.address);
      expect(status.usdtIn).to.be.equal(amount_usdt);
      expect(status.wbtcTicket).to.be.equal(ticket_wbtc);
      expect(status.quantity).to.be.equal(2);

      expect(status.fulfilled).to.true;
      expect(status.rewardLevels.length).to.be.equal(2);
    });

    it("getRequestIdByAddress() should work", async function () {
      // lottery for 10 tickets, 10 times
      let amount_usdt = parseUnits("100", usdt_decimals);
      let statuses = [];
      for (let i = 0; i < 10; i++) {
        await usdt.approve(xabi.address, 0);
        await usdt.approve(xabi.address, amount_usdt);

        let tx = await xabi.unsafeLottery(amount_usdt, addr2.address, 0, tags);
        let events = (await tx.wait()).events;
        let status = events.filter((x: Event) => x.event === "LotteryOutcome")[0].args.status;
        statuses.push(status);
      }

      let requestIds = await xabi.getRequestIdByAddress(owner.address);

      for (let i = 0; i < 10; i++) {
        expect(statuses[i].requestId).to.be.equal(requestIds[i]);
      }
    });

    it("getRequestStatusById() should work", async function () {
      let amount_usdt = parseUnits("100", usdt_decimals);

      await usdt.approve(xabi.address, 0);
      await usdt.approve(xabi.address, amount_usdt);

      let tx = await xabi.unsafeLottery(amount_usdt, addr2.address, 0, tags);
      let events = (await tx.wait()).events;
      let status = events.filter((x: Event) => x.event === "LotteryOutcome")[0].args.status;

      let statusById = await xabi.getRequestStatusById(status.requestId);

      expect(status).to.be.deep.equal(statusById);
    });

    it("estimateUSDT2WBTC() should work", async function () {
      let amount_usdt = parseUnits("10", usdt_decimals).toBigInt();
      let amount_wbtc = await xabi.estimateUSDT2WBTC(amount_usdt);
      expect(amount_wbtc).to.be.above(0);
    });
  });
});
