/* Holdable Token

The clear transfer order struct
     operationIdClear: {
       issuer,
       origin,
       target,
       value,
       reason,
       status
    }
*/

'use strict';

const {Contract} = require("fabric-contract-api");
const shim = require("fabric-shim");
const Validations = require("../helpers/validations");
const Utils = require("../helpers/utils");

const eip1996 = require('./eip1996');

const ClientIdentity = shim.ClientIdentity;

class eip18 extends eip1996{

    async orderTransfer(ctx, operationId, to, value){
        Validations.checkMspId(to);orderTransfer
        Validations.isGreaterThanZero(value);
        const issuerId = new ClientIdentity(ctx.stub).getMSPID();
        return await this._doOrderTransfer(ctx, operationId, issuerId, issuerId, to, value);
    }
    async orderTransferFrom(ctx, operationId, from, to, value){
        Validations.checkMspId(from);
        Validations.checkMspId(to);
        Validations.isGreaterThanZero(value);
        const issuerId = new ClientIdentity(ctx.stub).getMSPID();
        if (await this.isClearableTransferOperatorFor(ctx, issuerId, from) === "false"){
            console.error("Unauthorized for order transfer");
            return false;
        }
        return await this._doOrderTransfer(ctx, operationId, issuerId, from, to, value);
    }
    async _doOrderTransfer(ctx, operationId, issuerId, from, to, value){
        let clearObj = await ctx.stub.getState(`${operationId}Clear`);
        if (clearObj.toString() !== ""){throw new Error(`${operationId} already in use for clear transfer`)}
        const clearingAgent = await ctx.stub.getState("clearingAgent");
        await this._doHold(ctx, operationId, issuerId, from, to, clearingAgent, "0", value);
        clearObj = {}
        clearObj["issuer"] = issuerId;
        clearObj["origin"] = from;
        clearObj["target"] = to;
        clearObj["value"] = value;
        clearObj["status"] = "Ordered";
        await ctx.stub.putState(`${operationId}Clear`, Utils.toBuffer(JSON.stringify(clearObj)));
        return true;
    }
    //problima. to cancel transfer ginetai apo ton orderer enw to release hold ginetai apo ton payee | notary
    async cancelTransfer(ctx, operationId){
        const actionId = new ClientIdentity(ctx.stub).getMSPID();
        let clearObj = await ctx.stub.getState(`${operationId}Clear`);
        if (clearObj.toString() === ""){
            console.error(`No clear transfer request for ${operationId}`);
            return false;
        }
        clearObj = JSON.parse(clearObj.toString());
        if (clearObj["status"] !== "Ordered"){
            console.error("A clear transfer can only be canceled from status Ordered");
            return false;
        }
        if(actionId !== clearObj["issuer"]) {
            console.error("A clear transfer request can be canceled only by its issuer");
            return false;
        }
        await this.releaseHold(ctx, operationId);
        clearObj["status"] = "Cancelled";
        await ctx.stub.putState(`${operationId}Clear`, Utils.toBuffer(JSON.stringify(clearObj)));
        return true;
    }
    async processClearableTransfer(ctx, operationId){
        const actionId = new ClientIdentity(ctx.stub).getMSPID();
        let clearObj = await ctx.stub.getState(`${operationId}Clear`);
        if (clearObj.toString() === ""){
            console.error(`No clear transfer request for ${operationId}`);
            return false;
        }
        clearObj = JSON.parse(clearObj.toString());
        if (clearObj["status"] !== "Ordered"){
            console.error("A clear transfer can only be processed from status Ordered");
            return false;
        }
        clearObj["status"] = "InProcess";
        await ctx.stub.putState(`${operationId}Clear`, Utils.toBuffer(JSON.stringify(clearObj)));
        return true;
    }
    async executeClearableTransfer(ctx, operationId){
        const actionId = new ClientIdentity(ctx.stub).getMSPID();
        const clearingAgent = (await ctx.stub.getState('clearingAgent')).toString();
        if (actionId !== clearingAgent){
            console.error("Only a clearing agent can successfully execute this action");
            return false;
        }
        let clearObj = await ctx.stub.getState(`${operationId}Clear`);
        if (clearObj.toString() === ""){
            console.error(`No clear transfer request for ${operationId}`);
            return false;
        }
        clearObj = JSON.parse(clearObj.toString());
        if (clearObj["status"] !== "InProcess"){
            console.error("A clear transfer can only be executed from status InProcess");
            return false;
        }
        const executeHoldValue = await this.executeHold(ctx, operationId, clearObj["value"]);
        if (!executeHoldValue){return false;}
        clearObj["status"] = "Executed";
        await ctx.stub.putState(`${operationId}Clear`, Utils.toBuffer(JSON.stringify(clearObj)));
        return true;
    }
    async rejectClearableTransfer(ctx, operationId, reason){
        const actionId = new ClientIdentity(ctx.stub).getMSPID();
        const clearingAgent = (await ctx.stub.getState('clearingAgent')).toString();
        if (actionId !== clearingAgent){
            console.error("Only a clearing agent can successfully execute this action");
            return false;
        }
        let clearObj = await ctx.stub.getState(`${operationId}Clear`);
        if (clearObj.toString() === ""){
            console.error(`No clear transfer request for ${operationId}`);
            return false;
        }
        clearObj = JSON.parse(clearObj.toString());
        const releaseHoldValue = await this.releaseHold(ctx, operationId);
        if (!releaseHoldValue){return false;}
        clearObj["reason"] = reason;
        clearObj["status"] = "Rejected";
        await ctx.stub.putState(`${operationId}Clear`, Utils.toBuffer(JSON.stringify(clearObj)));
        return true;
    }
    async retrieveClearableTransferData(ctx, operationId){
        return (await ctx.stub.getState(`${operationId}Clear`)).toString();
    }


    async authorizeClearableTransferOperator(ctx, operator){
        Validations.checkMspId(operator);
        const walletOwnerId = new ClientIdentity(ctx.stub).getMSPID();
        let holdAuthValue = await ctx.stub.getState(`${operator}MayClearTransfer${walletOwnerId}`);
        holdAuthValue = holdAuthValue.toString();
        if (holdAuthValue === "true"){throw new Error("Address is already authorized to clear transfer");}
        await ctx.stub.putState(`${operator}MayClearTransfer${walletOwnerId}`, Utils.toBuffer("true"));
        return true;
    }
    async revokeClearableTransferOperator(ctx, operator){
        Validations.checkMspId(operator);
        const walletOwnerId = new ClientIdentity(ctx.stub).getMSPID();
        let holdAuthValue = await ctx.stub.getState(`${operator}MayClearTransfer${walletOwnerId}`);
        holdAuthValue = holdAuthValue.toString();
        if (holdAuthValue === "false"){throw new Error("Address is already unauthorized to clear transfer");}
        await ctx.stub.putState(`${operator}MayClearTransfer${walletOwnerId}`, Utils.toBuffer("false"));
        return true;
    }
    async isClearableTransferOperatorFor(ctx, operator, from){
        Validations.checkMspId(operator);
        Validations.checkMspId(from);
        const holdAuthValue = await ctx.stub.getState(`${operator}MayClearTransfer${from}`);
        Validations.isTrueOrFalse(holdAuthValue);
        return holdAuthValue;
    }
}
module.exports = eip18;
