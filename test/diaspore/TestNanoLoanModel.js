const NanoLoanModel = artifacts.require("./diaspore/model/NanoLoanModel.sol");
const Helper = require('../Helper.js');
const BN = require('bn.js');

const MAX_UINT128 = (new BN(2)).pow(new BN(128));
const MAX_UINT64  = (new BN(2)).pow(new BN(64));

let owner;
let model;
let idCounter = 0;

const secondsInDay = 86400;
const monthInSec = 30 * secondsInDay;
const amount = 10000;
const interestRate = Helper.toInterestRate(30);
const interestRatePunitory = Helper.toInterestRate(60);

const defaultParams = [
  Helper.toBytes32(amount),                    // amount
  Helper.toBytes32(interestRate),              // interest rate
  Helper.toBytes32(interestRatePunitory),      // interest rate punitory
  Helper.toBytes32(monthInSec),                // dues in
  Helper.toBytes32(Math.floor(monthInSec / 2)) // cancelable at
]

const STATUS_PAID = 2;

contract('NanoLoanModel', function(accounts) {
  before("Create model", async function(){
    owner = accounts[1];
    model = await NanoLoanModel.new( { from: owner} );
    await model.setEngine(owner, { from: owner} );
    assert.equal(await model.engine(), owner);
  })

  it("Test get obligations functions", async function() {
    const id = Helper.toBytes32(idCounter++);
    //if the loan its no create the obligation should be 0
    assert.equal((await model.getClosingObligation(id)).toString(), 0, "should be 0");
    assert.equal((await model.getEstimateObligation(id)).toString(), 0, "should be 0");
    assert.equal((await model.getObligation(id, 0)).toString(), [0, false], "should be 0, false");
  });

  it("Test validate function", async function() {
    async function tryValidate(changeIndexs, values, message) {
      let params = JSON.parse(JSON.stringify(defaultParams));
      for(let i = 0; i < changeIndexs.length; i++)
        params[changeIndexs[i]] = Helper.toBytes32(values[i]);
      await Helper.tryCatchRevert(() => model.validate(params), message);
    }
    // Try validate:
    // a wrong data length
    await Helper.tryCatchRevert(() => model.validate(defaultParams.slice(1)), "Wrong loan data arguments count");
    // a data with cancelable at more than dues in
    await tryValidate([3, 4], [1, 2], "The cancelableAt should be less or equal than duesIn");
    // a data with interest rate less than 1000
    await tryValidate([1], [1000], "Interest rate too high");
    // a data with interest rate punitory less than 1000
    await tryValidate([2], [1000], "Punitory interest rate too high");
    // a data with amount 0
    await tryValidate([0], [0], "amount can't be 0");
    // data with dues in equal 0
    await tryValidate([3, 4], [0, 0], "duesIn should be not 0 or overflow now plus duesIn");
    // Check overflows
    await tryValidate([0], [MAX_UINT128], "Amount too high");
    await tryValidate([3], [MAX_UINT64], "Dues in duration too long");
    await tryValidate([3, 4], [MAX_UINT64, MAX_UINT64], "Dues in duration too long");
  });

  it("Test create function", async function() {
    const id = Helper.toBytes32(idCounter++);
    const tx = await model.create(id, defaultParams, { from: owner });
    const timestamp = (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp;
    const config = await model.configs(id);

    assert.equal(Helper.toBytes32(config[0]), defaultParams[0], "The amount its wrong");
    assert.equal(Helper.toBytes32(config[1]), defaultParams[1], "The interest rate its wrong");
    assert.equal(Helper.toBytes32(config[2]), defaultParams[2], "The interest rate punitory its wrong");
    assert.equal(config[3], timestamp + monthInSec, "The dues in its wrong");
    assert.equal(config[4], id, "The id its wrong");
    const state = await model.states(id);

    assert.equal(state[0].toString(), 0, "The paid should be 0");
    assert.equal(state[1].toString(), 125, "The interest should be 125");
    assert.equal(state[2].toString(), 0, "The punitoryInterest should be 0");
    assert.equal(state[3].toString(), timestamp + Math.floor(monthInSec / 2), "The interestTimestamp should be the timestamp of block of create transaction plus the cancelable at");
    assert.equal(state[4].toString(), 0, "The status should not be paid");
  });

  it("Test addPaid without punitory", async function() {
    const id = Helper.toBytes32(idCounter++);
    const txCreate = await model.create(id, defaultParams, { from: owner });
    const timestampCreate = (await web3.eth.getBlock(txCreate.receipt.blockNumber)).timestamp;
    await Helper.increaseTime(1000000);
    const txPaid = await model.addPaid(id, 1000, { from: owner });
    const state = await model.states(id);

    assert.equal(state[0].toString(), 1000, "The paid should be 1000");
    assert.equal(state[1].toString(), 125, "The interest should be 125");
    assert.equal(state[2].toString(), 0, "The punitoryInterest should be 0");
    assert.equal(state[3].toString(), timestampCreate + Math.floor(monthInSec / 2), "The interestTimestamp should be the timestamp of block of create transaction  plus the cancelable at");
    assert.equal(state[4].toString(), 0, "The status should not be paid");
  });

  it("Test pay total with interest and interestPunitory", async function() {
    const id = Helper.toBytes32(idCounter++);
    const txCreate = await model.create(id, defaultParams, { from: owner });
    await Helper.increaseTime(monthInSec * 2);
    const interestTotal = Math.floor((10000 * 30/12)/100); // 250
    const interestPTotal = Math.floor(((10000 + interestTotal) * 60/12)/100); // 512.5
    const total = Math.floor(10000 + interestTotal + interestPTotal); // 10762
    await model.addPaid(id, total, { from: owner });
    const state = await model.states(id);

    assert.equal(state[0].toString(), total, "The paid should be 10762");
    assert.equal(state[1].toString(), interestTotal, "The interest should be 250");
    assert.equal(state[2].toString(), interestPTotal, "The punitoryInterest should be 512");
    assert.equal(state[4].toString(), STATUS_PAID, "The status should be paid");
  });

  const sd = 24*60*60;// seconds in a day
  //                                               amount , interest , pInterest, duesIn  , d1, v1     , d2, v2     , d3, v3     , d4, v4
  it("Test E1 28% Anual interest, 91 days", e_test(10000  , 28       , 42       , 91      , 30, 10233  , 31, 10474  , 91, 11469  , 5 , 11530));
  it("Test E2 28% Anual interest, 30 days", e_test(800000 , 28       , 42       , 30      , 10, 806222 , 10, 812444 , 30, 837768 , 5 , 842543));
  it("Test E3 27% Anual interest, 30 days", e_test(10000  , 27       , 40.5     , 30      , 10, 10075  , 10, 10150  , 30, 10455  , 5 , 10512));
  it("Test E4 40% Anual interest, 30 days", e_test(500000 , 40       , 60       , 30      , 10, 505555 , 10, 511111 , 30, 533888 , 5 , 538193));
  it("Test E5 40% Anual interest, 30 days", e_test(80000  , 40       , 60       , 30      , 10, 80889  , 10, 81778  , 30, 85422  , 5 , 86109));
  it("Test E6 42% Anual interest, 30 days", e_test(1000000, 42       , 63       , 30      , 10, 1011667, 10, 1023333, 30, 1071225, 5 , 1080281));
  it("Test E7 27% Anual interset, 30 days", e_test(70000  , 27       , 40.5     , 30      , 10, 70525  , 10, 71050  , 30, 73185  , 5 , 73587));
  it("Test E8 42% Anual interset, 30 days", e_test(500000 , 42       , 63       , 30      , 10, 505833 , 10, 511667 , 30, 535613 , 5 , 540140));
  it("Test E9 30% Anual interset, 30 days", e_test(300000 , 30       , 45       , 30      , 10, 302500 , 10, 305000 , 30, 315188 , 5 , 317108));
  // with punitory interest
  it("Test E10 30% Anual interset,  5 days", e_test(300000, 30       , 30       , 5       , 10, 302505 , 10, 305015 , 30, 312546 , 5 , 313801));

  function e_test(amount, interest, punitoryInterest, duesIn, d1, v1, d2, v2, d3, v3, d4, v4) {
    return async() => {
      // Create a new loan with the received params
      const id = Helper.toBytes32(idCounter++);
      const params = [
        Helper.toBytes32(amount),                                 // amount
        Helper.toBytes32(Helper.toInterestRate(interest)),        // interest rate
        Helper.toBytes32(Helper.toInterestRate(punitoryInterest)),// interest rate punitory
        Helper.toBytes32(duesIn*sd),                              // dues in
        Helper.toBytes32(0)                                       // cancelable at
      ]
      await model.create(id, params, { from: owner });

      // forward time, d1 days
      await Helper.increaseTime(d1 * sd);

      // check that the interest accumulated it's close to the defined by the test
      await model.run(id);

      const d1PendingAmount = await model.getClosingObligation(id);
      const d1Diff = Math.abs(d1PendingAmount.toNumber() - v1);
      assert.isBelow(d1Diff, 2, "The v1 should aprox the interest rate in the d1 timestamp");

      // forward time, d2 days
      await Helper.increaseTime(d2 * sd);

      // check that the interest accumulated it's close to the defined by the test
      const d2PendingAmount = await model.getClosingObligation(id);
      const d2Diff = Math.abs(d2PendingAmount.toNumber() - v2);
      assert.isBelow(d2Diff, 2, "The v2 should aprox the interest rate in the d2 timestamp");

      // forward time, d3 days
      await Helper.increaseTime(d3 * sd);

      // check that the interest accumulated it's close to the defined by the test
      await model.run(id);
      const d3PendingAmount = await model.getClosingObligation(id);
      const d3Diff = Math.abs(d3PendingAmount.toNumber() - v3);
      assert.isBelow(d3Diff, 2, "The v3 should aprox the interest rate in the d3 timestamp");

      // forward time, d4 days
      await Helper.increaseTime(d4 * sd);

      // check that the interest accumulated it's close to the defined by the test
      const d4PendingAmount = await model.getClosingObligation(id);
      const d4Diff = Math.abs(d4PendingAmount.toNumber() - v4);
      assert.isBelow(d4Diff, 2, "The v4 should aprox the interest rate in the d4 timestamp");

      // pay total amount
      const txPaid = await model.addPaid(id, d4PendingAmount, { from: owner });
      const state = await model.states(id);
      assert.equal(state[0].toString(), d4PendingAmount, "The paid should be " + d4PendingAmount);
      assert.equal(state[4].toString(), STATUS_PAID, "The status should be paid");
    }
  };
})