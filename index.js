/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
/**
 * @dev Start chaincode
 */

const eip20 = require('./lib/eip20');
const eip19 = require('./lib/eip19');
const eip18 = require('./lib/eip18');

module.exports.eip20 = eip20;
module.exports.eip19 = eip19;
module.exports.eip18 = eip18;
module.exports.contracts = [ eip20, eip19, eip18 ];
