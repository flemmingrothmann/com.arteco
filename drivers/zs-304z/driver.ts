'use strict';

import { ZigBeeDriver } from 'homey-zigbeedriver';

module.exports = class ZS304ZDriver extends ZigBeeDriver {

  async onInit() {
    this.log('ZS-304Z Driver has been initialized');
  }

};
