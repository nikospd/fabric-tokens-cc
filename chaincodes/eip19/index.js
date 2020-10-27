/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
/**
 * @dev Start chaincode
 */

const eip19 = require('./lib/eip19');

module.exports.eip19 = eip19;
module.exports.contracts = [ eip19 ];
