import { BigNumber, Event, Contract } from "ethers";
import { expect } from "chai";
import { network, ethers } from "hardhat";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
let parseUnits = ethers.utils.parseUnits;
let formatUnits = ethers.utils.formatUnits;
let getAddress = ethers.utils.getAddress;

const INIT_XBIT = "0.025";
const SUB_ID = 1;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"; // mainnet
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // mainnet
const WBTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"; // mainnet
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // mainnet
const ROUTER_V2_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // mainnet
const ROUTER_V3_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // mainnet

// useful ABIs only
const erc20Abi = [
  // Read-Only Functions
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  // Authenticated Functions
  "function transfer(address to, uint amount) returns (bool)",
  "function deposit() public payable",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const xbitAbi = [
  // Xbit inherits from ERC20
  ...erc20Abi,
  // Xbit Functions
];

describe("Xbit", function () {
  let owner: any, addr1: any, addr2: any;
  let weth: Contract, wbtc: Contract, usdt: Contract, xexp: Contract, xbit: Contract, simpleSwap: Contract;

  let wbtc_decimals: BigNumber, usdt_decimals: BigNumber, xbit_decimals: BigNumber;

  const tags = { gasLimit: 300000 };

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

    // initialize account
    const ether10 = ethers.utils.parseEther("10");
    await (await weth.deposit({ value: ether10.toBigInt() * 10n })).wait();
    await weth.approve(simpleSwap.address, ether10);
    await (await simpleSwap.swapWETHForUSDT(ether10, tags)).wait();
    await weth.approve(simpleSwap.address, ether10);
    await (await simpleSwap.swapWETHForWBTC(ether10, tags)).wait();

    [wbtc_decimals, usdt_decimals, xbit_decimals] = await Promise.all([
      wbtc.decimals(),
      usdt.decimals(),
      xbit.decimals(),
    ]);
  });

  describe("deployment", function () {
    it("deployment should set the right owner", async function () {
      expect(await xbit.owner()).to.equal(owner.address);
    });

    it("xbit should be able to mint in dev mode", async function () {
      await xbit.mint(owner.address, 1234567);

      expect(await xbit.balanceOf(owner.address)).to.equal(1234567);
      expect(await xbit.totalSupply()).to.equal(1234567);
    });

    it("owner should have some USDT and WBTC", async function () {
      expect(await usdt.balanceOf(owner.address)).to.above(parseUnits("100", usdt_decimals));
      expect(await wbtc.balanceOf(owner.address)).to.above(parseUnits("1", wbtc_decimals));
    });
  });

  describe("save", function () {
    it("save() should initialize", async function () {
      // check initial balances
      const wbtc_balance_sender_0 = await wbtc.balanceOf(owner.address);
      const wbtc_balance_contract_0 = await wbtc.balanceOf(xbit.address);
      const xbit_balance_sender_0 = await xbit.balanceOf(owner.address);
      expect(wbtc_balance_sender_0).to.above(parseUnits("1", wbtc_decimals));
      expect(wbtc_balance_contract_0).to.equal(0);
      expect(xbit_balance_sender_0).to.equal(0);

      // initialize pool
      let amount_wbtc = parseUnits(INIT_XBIT, wbtc_decimals);
      let wanted_xbit = parseUnits(INIT_XBIT, xbit_decimals);
      await wbtc.approve(xbit.address, amount_wbtc);
      await (await xbit.save(amount_wbtc)).wait();

      // check final balances
      const wbtc_balance_sender_1 = await wbtc.balanceOf(owner.address);
      const wbtc_balance_contract_1 = await wbtc.balanceOf(xbit.address);
      const xbit_balance_sender_1 = await xbit.balanceOf(owner.address);
      expect(wbtc_balance_sender_0.toBigInt() - wbtc_balance_sender_1.toBigInt()).to.equal(amount_wbtc);
      expect(wbtc_balance_contract_1).to.equal(amount_wbtc);
      expect(xbit_balance_sender_1).to.equal(wanted_xbit);
    });

    it("save() should work", async function () {
      // initialize pool
      let amount_wbtc = parseUnits(INIT_XBIT, wbtc_decimals).toBigInt();
      let amount_xbit = parseUnits(INIT_XBIT, xbit_decimals).toBigInt();
      await wbtc.approve(xbit.address, amount_wbtc);
      await (await xbit.save(amount_wbtc)).wait();

      // transfer double amount of wbtc to pool
      await wbtc.approve(xbit.address, amount_wbtc * 2n);
      await (await wbtc.transfer(xbit.address, amount_wbtc * 2n)).wait();
      expect(await wbtc.balanceOf(xbit.address)).to.equal(amount_wbtc * 3n);

      const wbtc_balance_sender_1 = await wbtc.balanceOf(owner.address);
      const xbit_balance_sender_1 = await xbit.balanceOf(owner.address);

      // standard save
      await wbtc.approve(xbit.address, amount_wbtc);
      await (await xbit.save(amount_wbtc)).wait();

      // check final balances
      const wbtc_balance_sender_2 = await wbtc.balanceOf(owner.address);
      const wbtc_balance_contract_2 = await wbtc.balanceOf(xbit.address);
      const xbit_balance_sender_2 = await xbit.balanceOf(owner.address);
      expect(wbtc_balance_sender_1 - wbtc_balance_sender_2).to.equal(amount_wbtc);
      expect(wbtc_balance_contract_2).to.equal(amount_wbtc * 4n);
      expect(xbit_balance_sender_2.toBigInt() - xbit_balance_sender_1.toBigInt()).to.equal(amount_xbit / 3n);
    });
  });

  describe("withdraw", function () {
    it("withdraw() should work", async function () {
      // initialize pool
      let amount_wbtc = parseUnits(INIT_XBIT, wbtc_decimals).toBigInt();
      let amount_xbit = parseUnits(INIT_XBIT, xbit_decimals).toBigInt();
      await wbtc.approve(xbit.address, amount_wbtc);
      await (await xbit.save(amount_wbtc)).wait();

      // transfer amount of wbtc to pool
      await wbtc.approve(xbit.address, amount_wbtc);
      await (await wbtc.transfer(xbit.address, amount_wbtc)).wait();
      expect(await wbtc.balanceOf(xbit.address)).to.equal(amount_wbtc * 2n);

      const wbtc_balance_sender_1 = await wbtc.balanceOf(owner.address);

      // standard withdraw
      await xbit.approve(owner.address, amount_xbit / 2n);
      await (await xbit.withdraw(amount_xbit / 2n)).wait();

      // check final balances
      const wbtc_balance_sender_2 = await wbtc.balanceOf(owner.address);
      const xbit_balance_sender_2 = await xbit.balanceOf(owner.address);
      expect(wbtc_balance_sender_2.toBigInt() - wbtc_balance_sender_1.toBigInt()).to.equal(amount_wbtc);
      expect(xbit_balance_sender_2).to.equal(amount_xbit / 2n);
    });
  });

  describe("register", function () {
    it("invalid referrer should return 0", async function () {
      expect(await xbit.referrerRatio(ZERO_ADDRESS)).to.equal(0);
      expect(await xbit.referrerRatio(addr1.address)).to.equal(0);
      expect(await xbit.referrerRatio(owner.address)).to.equal(0);
    });

    it("register a referrer", async function () {
      await (await xbit.connect(addr1).register(1234)).wait();
      expect(await xbit.referrerRatio(ZERO_ADDRESS)).to.equal(0);
      expect(await xbit.referrerRatio(addr1.address)).to.equal(1234);
      expect(await xbit.referrerRatio(addr2.address)).to.equal(0);
    });

    it("ratio higher than 1e5 is not allowed", async function () {
      await expect(xbit.register(1e6)).to.be.revertedWith("referrer fee should be less than 10%");
    });
  });

  describe("swap", function () {
    it("only owner can update maintainer", async function () {
      await expect(xbit.connect(addr1).setMaintainer(addr1.address)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      await (await xbit.setMaintainer(addr1.address)).wait();
    });

    it("only owner or maintainer can trigger swap", async function () {
      // prepare USDT pool
      let amount_usdt = parseUnits("10", usdt_decimals).toBigInt();
      await usdt.approve(xbit.address, 0); // non-standard for usdt only
      await usdt.approve(xbit.address, amount_usdt);
      await usdt.transfer(xbit.address, amount_usdt * 10n);

      await (await xbit.setMaintainer(addr1.address)).wait();
      await (await xbit.swap(amount_usdt, tags)).wait();
      await (await xbit.connect(addr1).swap(amount_usdt, tags)).wait();
      await expect(xbit.connect(addr2).swap(amount_usdt, tags)).to.be.revertedWith(
        "only maintainer or owner can swap USDT to WBTC in contract pool"
      );
    });

    it("swap() should work", async function () {
      // prepare USDT pool
      let amount_usdt = parseUnits("10", usdt_decimals).toBigInt();
      await usdt.approve(xbit.address, 0); // non-standard for usdt only
      await usdt.approve(xbit.address, amount_usdt);
      await usdt.transfer(xbit.address, amount_usdt);

      // check initial USDT pool and WBTC pool
      expect(await usdt.balanceOf(xbit.address)).to.equal(amount_usdt);
      expect(await wbtc.balanceOf(xbit.address)).to.equal(0);

      // swap USDT to WBTC
      await wbtc.approve(xbit.address, amount_usdt);
      let tx = await xbit.swap(amount_usdt, tags);
      let events = (await tx.wait()).events;
      let amount_wbtc = events.filter((x: Event) => x.event === "SwapUSDT2WBTC")[0].args.amount_wbtc;

      // check final USDT pool and WBTC pool
      expect(await usdt.balanceOf(xbit.address)).to.equal(0);
      // expect(await wbtc.balanceOf(xbit.address)).to.equal(amount_wbtc);
    });
  });

  describe("utils", function () {
    it("dice() should work", async function () {
      let rand0 = await xbit.dice();
      await mine(1);
      let rand1 = await xbit.dice();
      expect(rand0).to.be.not.equal(rand1);
    });

    it("estimateUSDT2WBTC() should work", async function () {
      let amount_usdt = parseUnits("10", usdt_decimals).toBigInt();
      let amount_wbtc = await xbit.estimateUSDT2WBTC(amount_usdt);
      expect(amount_wbtc).to.be.above(0);
    });
  });
});
