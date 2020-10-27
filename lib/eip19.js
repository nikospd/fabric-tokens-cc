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
const eip20 = require("./eip20");
const Validations = require("../helpers/validations");
const Utils = require("../helpers/utils");

const ClientIdentity = shim.ClientIdentity;

class eip19 extends eip20{
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
        if (fundAuthValue === "false"){throw new Error("Address is already unauthorized orderer");}
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
        if (fundOperatorValue === "false"){
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
