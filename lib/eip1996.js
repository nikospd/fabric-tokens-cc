/* Holdable Token

The hold order struct
     operationId: {
       issuer,
       origin,
       target,
       notary,
       expiration,
       value,
       status
    }
*/

'use strict';

const {Contract} = require("fabric-contract-api");
const shim = require("fabric-shim");
const Validations = require("../helpers/validations");
const Utils = require("../helpers/utils");

const eip20 = require('./eip20');

const ClientIdentity = shim.ClientIdentity;

class eip1996 extends eip20{
    async hold(ctx, operationId, to, notary, value, timeToExpiration){
        Validations.checkMspId(to);
        Validations.checkMspId(notary)
        Validations.isGreaterThanZero(value);
        Validations.isGreaterThanZero(timeToExpiration);
        const issuerId = new ClientIdentity(ctx.stub).getMSPID();
        return await this._doHold(ctx, operationId, issuerId, issuerId, to, notary, timeToExpiration, value);
    }
    async holdFrom(ctx, operationId, from, to, notary, value, timeToExpiration){
        Validations.checkMspId(from);
        Validations.checkMspId(to);
        Validations.checkMspId(notary)
        Validations.isGreaterThanZero(value);
        Validations.isGreaterThanZero(timeToExpiration);
        const issuerId = new ClientIdentity(ctx.stub).getMSPID();
        if (await this.isHoldOperatorFor(ctx, issuerId, from) !== "true"){
            throw new Error(`${issuerId} is unauthorized to hold on behalf of ${from}`);
        }
        return await this._doHold(ctx, operationId, issuerId, from, to, notary, timeToExpiration, value);
    }
    async releaseHold(ctx, operationId){
        const actionId = new ClientIdentity(ctx.stub).getMSPID();
        let holdObj = await ctx.stub.getState(operationId);
        if (holdObj.toString() === ""){
            console.error(`No hold request for ${operationId}`);
            return false;
        }
        holdObj = JSON.parse(holdObj.toString());
        if (holdObj["status"] !== "Ordered"){
            console.error("A hold can only be released from status Ordered");
            return false;
        }
        if (holdObj["expiration"] !== "0" && new Date() > holdObj["expiration"]){
            holdObj["status"] = "ReleasedOnExpiration";
        }else if(actionId === holdObj["target"]){
            holdObj["status"] = "ReleasedByPayee";
        }else if(actionId === holdObj["notary"]){
            holdObj["status"] = "ReleasedByNotary";
        }else{
            console.error("Unauthorized to cancel hold request");
            return false;
        }
        const origin = holdObj["origin"];
        const originHoldValue = Utils.defaultToZeroIfEmpty(await ctx.stub.getState(`${origin}HoldValue`));
        const totalHoldValue = Utils.defaultToZeroIfEmpty(await ctx.stub.getState(`totalHoldValue`));
        const originBalance = await this.getBalanceOf(ctx, holdObj["origin"]);
        try{
            await ctx.stub.putState(origin, Utils.toBuffer(originBalance + value));
            await ctx.stub.putState(`${origin}HoldValue`, Utils.toBuffer(originHoldValue - value));
            await ctx.stub.putState("totalHoldValue", Utils.toBuffer(totalHoldValue - value));
            await ctx.stub.putState(operationId, Utils.toBuffer(JSON.stringify(holdObj)));
            return true;
        }catch (error){
            console.error(error);
            return false;
        }

    }
    async executeHold(ctx, operationId, value){
        const actionId = new ClientIdentity(ctx.stub).getMSPID();
        let holdObj = await ctx.stub.getState(operationId);
        if (holdObj.toString() === ""){
            console.error(`No hold request for ${operationId}`);
            return false;
        }
        holdObj = JSON.parse(holdObj.toString());
        if (actionId !== holdObj["notary"]){
            console.error("Only the notary can execute a hold request");
            return false;
        }
        if (holdObj["status"] !== "Ordered" || holdObj["status"] !== "Executed"){
            console.error("A hold can only be released from status Ordered or Executed");
            return false;
        }
        if (holdObj["expiration"] !== "0" && new Date() > holdObj["expiration"]){
            console.error("Hold request expired");
            return false;
        }
        Validations.isSmallerOrEqual(value, holdObj["value"]);
        holdObj["value"] = holdObj["value"] - value;
        holdObj["status"] = "Executed";
        const origin = holdObj["origin"];
        const target = holdObj["target"];
        const targetBalance = await this.getBalanceOf(ctx, target);
        const originHoldValue = Utils.defaultToZeroIfEmpty(await ctx.stub.getState(`${origin}HoldValue`));
        const totalHoldValue = Utils.defaultToZeroIfEmpty(await ctx.stub.getState(`totalHoldValue`));
        try{
            await ctx.stub.putState(target, Utils.toBuffer(targetBalance + value));
            await ctx.stub.putState(`${origin}HoldValue`, Utils.toBuffer(originHoldValue - value));
            await ctx.stub.putState("totalHoldValue", Utils.toBuffer(totalHoldValue - value));
            await ctx.stub.putState(operationId, Utils.toBuffer(JSON.stringify(holdObj)));
            return true;
        }catch (error){
            console.error(error);
            return false;
        }
    }

    async _doHold(ctx, operationId, issuer, origin, target, notary, expiration, value){
        let holdObj = await ctx.stub.getState(operationId);
        if (holdObj.toString() !== ""){throw new Error(`${operationId} already in use`)}
        const originBalance = await this.getBalanceOf(ctx, origin);
        Validations.isSmallerOrEqual(value, originBalance);
        holdObj = {}
        holdObj["issuer"] = issuer;
        holdObj["origin"] = origin;
        holdObj["target"] = target;
        holdObj["notary"] = notary;
        holdObj["expiration"] = expiration;
        holdObj["value"] = value;
        holdObj["status"] = "Ordered";
        const originHoldValue = Utils.defaultToZeroIfEmpty(await ctx.stub.getState(`${origin}HoldValue`));
        const totalHoldValue = Utils.defaultToZeroIfEmpty(await ctx.stub.getState(`totalHoldValue`));
        try{
            await ctx.stub.putState(origin, Utils.toBuffer(originBalance - value));
            await ctx.stub.putState(`${origin}HoldValue`, Utils.toBuffer(originHoldValue + value));
            await ctx.stub.putState("totalHoldValue", Utils.toBuffer(totalHoldValue + value));
            await ctx.stub.putState(operationId, Utils.toBuffer(JSON.stringify(holdObj)));
            return true;
        }catch (error){
            console.error(error);
            return false;
        }
    }

    async renewHold(ctx, operationId, timeToExpiration){
        const actionId = new ClientIdentity(ctx.stub).getMSPID();
        let holdObj = await ctx.stub.getState(operationId);
        if (holdObj.toString() === ""){
            console.error(`No hold request for ${operationId}`);
            return false;
        }
        holdObj = JSON.parse(holdObj.toString());
        if (actionId !== holdObj["notary"] || actionId !== holdObj["origin"]){
            console.error("Only the notary or origin can execute a hold request");
            return false;
        }
        if (holdObj["expiration"] !== "0" && new Date() > holdObj["expiration"]){
            console.error("Hold request expired");
            return false;
        }
        holdObj["expiration"] = timeToExpiration;
        try{
            await ctx.stub.putState(operationId, Utils.toBuffer(JSON.stringify(holdObj)));
            return true;
        }catch (error){
            console.error(error);
            return false;
        }
    }
    async retrieveHoldData(ctx, operationId){
        return (await ctx.stub.getState(operationId)).toString();
    }

    async balanceOnHold(ctx, account){
        return Utils.bufferToFloat(await ctx.stub.getState(`${account}HoldValue`))
    }
    async netBalanceOf(ctx, account){
        const balance = Utils.bufferToFloat(await this.getBalanceOf(ctx, account));
        const holdBalance = Utils.bufferToFloat(await this.balanceOnHold(ctx, account));
        return (balance + holdBalance);
    }
    async totalSupplyOnHold(ctx){
        return Utils.bufferToFloat(await ctx.stub.getState("totalHoldValue"));
    }

    async authorizeHoldOperator(ctx, operator){
        Validations.checkMspId(operator);
        const walletOwnerId = new ClientIdentity(ctx.stub).getMSPID();
        let holdAuthValue = await ctx.stub.getState(`${operator}MayHold${walletOwnerId}`);
        holdAuthValue = holdAuthValue.toString();
        if (holdAuthValue === "true"){throw new Error("Address is already authorized to hold");}
        await ctx.stub.putState(`${operator}MayHold${walletOwnerId}`, Utils.toBuffer("true"));
        return true;
    }
    async revokeHoldOperator(ctx, operator){
        Validations.checkMspId(operator);
        const walletOwnerId = new ClientIdentity(ctx.stub).getMSPID();
        let holdAuthValue = await ctx.stub.getState(`${operator}MayHold${walletOwnerId}`);
        holdAuthValue = holdAuthValue.toString();
        if (holdAuthValue === "false"){throw new Error("Address is already unauthorized to hold");}
        await ctx.stub.putState(`${operator}MayHold${walletOwnerId}`, Utils.toBuffer("false"));
        return true;
    }
    async isHoldOperatorFor(ctx, operator, from){
        Validations.checkMspId(operator);
        Validations.checkMspId(from);
        const holdAuthValue = await ctx.stub.getState(`${operator}MayHold${from}`);
        Validations.isTrueOrFalse(holdAuthValue);
        return holdAuthValue;
    }


}

module.exports = eip1996;
