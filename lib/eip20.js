'use strict';

const {Contract} = require("fabric-contract-api");
const shim = require("fabric-shim");
const Validations = require("../helpers/validations");
const Utils = require("../helpers/utils");

const ClientIdentity = shim.ClientIdentity;

class eip20 extends Contract{
    async InitLedger(ctx){
        console.info('============= START : Initialize Ledger ===========');

        const testConfig = {
            "name": "testToken",
            "symbol": "TSTT"
        };

        const ownerId = new ClientIdentity(ctx.stub).getMSPID();


        const bufferedOwner = Utils.toBuffer(ownerId);
        const bufferedName = Utils.toBuffer(testConfig.name);
        const bufferedSymbol = Utils.toBuffer(testConfig.symbol);
        const bufferedTotalSupply = Utils.toBuffer("30");

        await ctx.stub.putState(ownerId, Utils.toBuffer("12"))
        await ctx.stub.putState("owner", bufferedOwner);
        await ctx.stub.putState("name", bufferedName);
        await ctx.stub.putState("symbol", bufferedSymbol);
        await ctx.stub.putState("totalSupply", bufferedTotalSupply);
        await ctx.stub.putState("clearingAgent", Utils.toBuffer(ownerId));

        console.info('============= END : Initialize Ledger ===========');
    }

    async getTokenName(ctx){
        console.info('============= GET TOKEN NAME ===========');
        let name = await ctx.stub.getState("name");
        name = Utils.defaultToUndefinedIfEmpty(name);
        return name.toString();
    }

    async getTokenSymbol(ctx){
        console.info('============= GET TOKEN SYMBOL ===========');
        let symbol = await ctx.stub.getState("symbol");
        symbol = Utils.defaultToUndefinedIfEmpty(symbol);
        return symbol.toString();
    }

    async getTokenOwner(ctx) {
        let owner = await ctx.stub.getState("owner");
        owner = Utils.defaultToUndefinedIfEmpty(owner);
        return owner.toString();
    }

    async getTotalSupply(ctx) {
        let totalSupply = await ctx.stub.getState("totalSupply");
        totalSupply = Utils.defaultToZeroIfEmpty(totalSupply);
        return Utils.bufferToFloat(totalSupply);
    }
    async getBalanceOf(ctx, address) {
        Validations.checkMspId(address);

        let tokenBalance = await ctx.stub.getState(address);
        tokenBalance = Utils.defaultToZeroIfEmpty(tokenBalance);
        return Utils.bufferToFloat(tokenBalance);
    }
    async transfer(ctx, receiverId, value){
        Validations.checkMspId(receiverId);
        Validations.isGreaterThanZero(value);
        const senderId = new ClientIdentity(ctx.stub).getMSPID();

        value = parseFloat(value);
        const [balanceOfSender, balanceOfReceiver] = [await this.getBalanceOf(ctx, senderId), await this.getBalanceOf(ctx, receiverId)];
        Validations.isSmallerOrEqual(value, balanceOfSender);

        const newSenderBalance = Utils.toBuffer(balanceOfSender - value);
        const newReceiverBalance = Utils.toBuffer(balanceOfReceiver + value);

        try {
            await ctx.stub.putState(senderId, newSenderBalance);
            await ctx.stub.putState(receiverId, newReceiverBalance);
        } catch (error) {
            throw new Error(`Failed to update state. Error: ${error}`);
        }
    }

    async approve(ctx, spenderId, value){
        Validations.checkMspId(spenderId);
        Validations.isGreaterThanZero(value);
        value = parseFloat(value);
        const ownerId = new ClientIdentity(ctx.stub).getMSPID();
        value = Utils.toBuffer(value);
        await ctx.stub.putState(`${ownerId}-${spenderId}`, value);
    }

    async allowance(ctx, ownerId, spenderId) {
        Validations.checkMspId(spenderId);
        Validations.checkMspId(ownerId);
        let value = await ctx.stub.getState(`${ownerId}-${spenderId}`);
        value = Utils.defaultToZeroIfEmpty(value);
        return Utils.bufferToFloat(value);
    }

    async transferFrom(ctx, ownerId, spenderId, value){
        Validations.checkMspId(spenderId);
        Validations.checkMspId(ownerId);
        Validations.isGreaterThanZero(value);
        value = parseFloat(value);
        const allowanceValue = await this.allowance(ctx, ownerId, spenderId);
        Validations.isSmallerOrEqual(value, allowanceValue);

        const [balanceOfOwner, balanceOfSpender] = [await this.getBalanceOf(ctx, ownerId), await this.getBalanceOf(ctx, spenderId)];
        Validations.isSmallerOrEqual(value, balanceOfOwner);

        const newBalanceOfOwner = Utils.toBuffer(balanceOfOwner - value);
        const newBalanceOfSpender = Utils.toBuffer(balanceOfSpender + value);
        const newAllowanceValue = Utils.toBuffer(allowanceValue - value);
        try{
            await ctx.stub.putState(ownerId, newBalanceOfOwner);
            await ctx.stub.putState(spenderId, newBalanceOfSpender);
            await ctx.stub.putState(`${ownerId}-${spenderId}`, newAllowanceValue);
        }catch (error){
            throw new Error(`Failed to update state. Error: ${error}`);
        }
    }
}
module.exports = eip20;
