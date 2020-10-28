/* Fundable Token

The fund order struct
     operationId: {
       orderer,
       walletToFund,
       value,
       instructions,
       status
    }
*/

'use strict';

const {Contract} = require("fabric-contract-api");
const shim = require("fabric-shim");
// const eip20 = require("./eip20");
const Validations = require("../helpers/validations");
const Utils = require("../helpers/utils");

const ClientIdentity = shim.ClientIdentity;

class eip19 extends Contract{

    // eip20
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

    // eip19
    async authorizeFundOperator(ctx, ordererId){
        Validations.checkMspId(ordererId)
        const walletOwnerId = new ClientIdentity(ctx.stub).getMSPID();
        let fundAuthValue = await ctx.stub.getState(`${walletOwnerId}Fund${ordererId}`);
        fundAuthValue = fundAuthValue.toString();
        if (fundAuthValue === "true"){throw new Error("Address is already authorized orderer");}
        fundAuthValue = "true";
        await ctx.stub.putState(`${walletOwnerId}Fund${ordererId}`, Utils.toBuffer(fundAuthValue));
        return true;
    }
    async revokeFundOperator(ctx, ordererId){
        Validations.checkMspId(ordererId)
        const walletOwnerId = new ClientIdentity(ctx.stub).getMSPID();
        let fundAuthValue = await ctx.stub.getState(`${walletOwnerId}Fund${ordererId}`);
        fundAuthValue = fundAuthValue.toString();
        if (fundAuthValue.toString() === "false"){throw new Error("Address is already unauthorized orderer");}
        fundAuthValue = "false";
        await ctx.stub.putState(`${walletOwnerId}Fund${ordererId}`, Utils.toBuffer(fundAuthValue));
        return true;
    }
    async orderFund(ctx, operationId, value, instructions){
        const ordererId = new ClientIdentity(ctx.stub).getMSPID();
        await this.doOrderFund(ctx, operationId, ordererId, value, instructions);
        return true;
    }
    async orderFundFrom(ctx, operationId, walletToFund, value, instructions){
        const ordererId = new ClientIdentity(ctx.stub).getMSPID();
        const fundOperatorValue = await this.isFundOperatorFor(ctx, walletToFund, ordererId);
        if (fundOperatorValue.toString() === "false"){
            return false;
        }
        await this.doOrderFund(ctx, operationId, walletToFund, value, instructions);

        return true;
    }
    async doOrderFund(ctx, operationId, walletToFund, value, instructions){
        Validations.isGreaterThanZero(value);
        Validations.isNotEmpty(instructions);
        const ordererId = new ClientIdentity(ctx.stub).getMSPID();

        let bufferedFundStruct = await ctx.stub.getState(operationId);
        if (bufferedFundStruct.toString() !== ""){throw new Error("OperationId already exists")}
        const fundStruct = {};
        fundStruct["orderer"] = ordererId;
        fundStruct["walletToFund"] = walletToFund;
        fundStruct["value"] = value;
        fundStruct["instructions"] = instructions;
        fundStruct["status"] = "Ordered";
        await ctx.stub.putState(operationId, Utils.toBuffer(JSON.stringify(fundStruct)));
        return true;
    }



    async cancelFund(ctx, operationId){
        const ordererId = new ClientIdentity(ctx.stub).getMSPID();
        const bufferedFundStruct = await ctx.stub.getState(operationId);
        const fundStruct = JSON.parse(bufferedFundStruct.toString());
        if (fundStruct["orderer"] !== ordererId && fundStruct["walletToFund"] !== ordererId){
            throw new Error("Unauthorized to cancel fund");
        }
        if (fundStruct["status"] !== "Ordered"){
            throw new Error("A fund can only be cancelled from status Ordered")
        }
        fundStruct["status"] = "Cancelled";
        await ctx.stub.putState(operationId, Utils.toBuffer(JSON.stringify(bufferedFundStruct)));
        return true;
    }
    async processFund(ctx, operationId){
        const bufferedFundStruct = await ctx.stub.getState(operationId);
        const fundStruct = JSON.parse(bufferedFundStruct.toString());
        if (fundStruct["status"] !== "Ordered"){
            throw new Error("A fund can only be put in process from status Ordered")
        }
        fundStruct["status"] = "InProcess";
        await ctx.stub.putState(operationId, Utils.toBuffer(JSON.stringify(bufferedFundStruct)));
        return true;
    }
    async executeFund(ctx, operationId){
        const bufferedFundStruct = await ctx.stub.getState(operationId);
        const fundStruct = JSON.parse(bufferedFundStruct.toString());
        if (fundStruct["status"] !== "InProcess"){
            throw new Error("A fund can only be executed from status InProcess")
        }
        const walletToFundBalance = await this.getBalanceOf(ctx, fundStruct["walletToFund"]);
        await ctx.stub.putState(fundStruct["walletToFund"], Utils.toBuffer(walletToFundBalance + fundStruct["value"]));
        fundStruct["status"] = "Executed";
        await ctx.stub.putState(operationId, Utils.toBuffer(JSON.stringify(bufferedFundStruct)));
        return true;
    }
    async rejectFund(ctx, operationId, reason){
        const bufferedFundStruct = await ctx.stub.getState(operationId);
        const fundStruct = JSON.parse(bufferedFundStruct.toString());
        if (fundStruct["status"] !== "InProcess" || fundStruct["status"] !== "Ordered"){
            throw new Error("A fund can only be rejected if the status is ordered or in progress")
        }
        fundStruct["status"] = "Rejected";
        fundStruct["reason"] = reason;
        await ctx.stub.putState(operationId, Utils.toBuffer(JSON.stringify(bufferedFundStruct)));
        return true;
    }
    async isFundOperatorFor(ctx, walletOwnerId, ordererId){
        let fundAuthValue = await ctx.stub.getState(`${walletOwnerId}Fund${ordererId}`);
        fundAuthValue = fundAuthValue.toString();
        Validations.isTrueOrFalse(fundAuthValue);
        return fundAuthValue;
    }
    async retrieveFundData(ctx, operationId){
        const ordererId = new ClientIdentity(ctx.stub).getMSPID();
        const tokenOwner = await this.getTokenOwner(ctx);
        const bufferedFundStruct = await ctx.stub.getState(operationId);
        const fundStruct = JSON.parse(bufferedFundStruct.toString());
        if(ordererId === tokenOwner || ordererId === fundStruct["orderer"]){
            return JSON.stringify(fundStruct);
        }else{
            return "Unauthorized to get the fund data"
        }

    }
}

module.exports = eip19;
