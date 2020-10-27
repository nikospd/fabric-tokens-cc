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

module.exports.eip20 = eip20;
module.exports.contracts = [ eip20 ];
