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


const ClientIdentity = shim.ClientIdentity;

class eip18 extends Contract{

    //eip20

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

    //eip1996

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
        if ((await this.isHoldOperatorFor(ctx, issuerId, from)).toString() !== "true"){
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
        if (holdObj["status"] !== "Ordered"){
            console.error("A hold can only be executed from status Ordered");
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

    //eip18

    async orderTransfer(ctx, operationId, to, value){
        Validations.checkMspId(to);
        Validations.isGreaterThanZero(value);
        const issuerId = new ClientIdentity(ctx.stub).getMSPID();
        return await this._doOrderTransfer(ctx, operationId, issuerId, issuerId, to, value);
    }
    async orderTransferFrom(ctx, operationId, from, to, value){
        Validations.checkMspId(from);
        Validations.checkMspId(to);
        Validations.isGreaterThanZero(value);
        const issuerId = new ClientIdentity(ctx.stub).getMSPID();
        if ((await this.isClearableTransferOperatorFor(ctx, issuerId, from)).toString() === "false"){
            console.error("Unauthorized for order transfer");
            return false;
        }
        return await this._doOrderTransfer(ctx, operationId, issuerId, from, to, value);
    }
    async _doOrderTransfer(ctx, operationId, issuerId, from, to, value){
        let clearObj = await ctx.stub.getState(`${operationId}Clear`);
        if (clearObj.toString() !== ""){throw new Error(`${operationId} already in use for clear transfer`)}
        const clearingAgent = await ctx.stub.getState("clearingAgent");
        await this._doHold(ctx, operationId, issuerId, from, to, clearingAgent.toString(), "0", value);
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

