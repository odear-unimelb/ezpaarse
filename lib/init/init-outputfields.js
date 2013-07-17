'use strict';

var InitError = require('../initerror.js');
var ezJobs    = require('../jobs.js');

/**
 * Sets the array containing the fields to use when writing ECs
 * @param  {Object}   req        the request stream
 * @param  {Object}   res        the response stream
 * @param  {Object}   logger     the log writer
 * @param  {Function} callback   returns an array of fields to add
 *                                   and an array of fields do remove
 */
module.exports = function (req, res, logger, callback) {
  logger.verbose('Initializing output fields');
  var job           = ezJobs[req.ezRID];
  job.outputFields  = job.outputFields || { added: [], removed: [] };

  var fieldsHeader  = req.header('Output-Fields');
  var removedFields = [];

  if (fieldsHeader) {
    logger.verbose('Fields header: ' + fieldsHeader);
    var fields = fieldsHeader.split(',');
    for (var i = 0, l = fields.length; i < l; i++) {
      var field    = fields[i].trim();
      var operator = field.charAt(0);
      field        = field.substring(1).trim();
      if (!field) {
        callback(new InitError(400, 4012));
        return;
      }
      
      switch (operator) {
      case '+':
        if (job.outputFields.added.indexOf(field) == -1) {
          job.outputFields.added.push(field);
        }
        break;
      case '-':
        job.outputFields.removed.push(field);
        break;
      default:
        callback(new InitError(400, 4013));
        return;
      }
    }
  } else {
    logger.verbose('Using default fields');
  }

  callback(null);
}