/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
/**
 * @dev Start chaincode
 */

const eip18 = require('./lib/eip18');

module.exports.eip18 = eip18;
module.exports.contracts = [ eip18 ];
