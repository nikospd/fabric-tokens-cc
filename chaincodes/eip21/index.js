/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
/**
 * @dev Start chaincode
 */

const eip21 = require('./lib/eip21');

module.exports.eip21 = eip21;
module.exports.contracts = [ eip21 ];
