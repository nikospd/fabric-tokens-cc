const Utils = class {
    static defaultToZeroIfEmpty(value) {
        if (value.toString() === "") {
            console.log("Defaulting to zero.");

            return Buffer.from("0");
        }
        return value;
    }

    static defaultToUndefinedIfEmpty(value) {
        if (value.toString() === "") {
            console.log("Defaulting to undefined.");

            return "undefined";
        }
        return value;
    }

    static defaultToFalseIfEmpty(value) {
        if (value.toString() === "") {
            console.log("Defaulting to undefined.");

            return "false";
        }
        return value;
    }

    static bufferToFloat(buffer) {
        try {
            return parseFloat(buffer.toString());
        } catch (error) {
            throw new Error(`Error parsing value to float: ${buffer.toString()}.`);
        }
    }

    static toBuffer(value) {
        return Buffer.from(value.toString());
    }

    static async processBalance(promise) {
        const balance = await promise;
        return parseFloat(balance.toString());
    }
};

module.exports = Utils;
