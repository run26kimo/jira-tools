/**
 * @desc Form handler for dialogIssuesFromFilter. Retrieve issues for given 
 *       filter with specified columns from Jira and insert into current active sheet.
 * @param jsonFormData {object}  JSON Form object of all form values
 * @return {object} Object({status: [boolean], response: [string]})
 */
function insertIssuesFromFilter(jsonFormData) {
  jsonFormData = jsonFormData || {filter_id: 0};
  var filter = getFilter( parseInt(jsonFormData.filter_id) ),
      response = {status: false, message: ''};

  var ok = function(resp, status, errorMessage) {
    debug.log('insertIssuesFromFilter() resp(len): %s; s: %s; msg: %s', resp.data.length, status, errorMessage);

    if( status === 200 ) {
      // any issues in result?
      if( resp.data.length === 0 ) {
        response.message = "No issues were found to match your search.";
        Browser.msgBox(response.message, Browser.Buttons.OK);
        return;
      }

      var sheet = getTicketSheet();
      var cell = sheet.getActiveCell();

      var table = new IssueTable(sheet, cell, {issues: resp.data});
      table.addHeader()
        .addSummary(filter.name)
        .fillTable();

      response.status = true;

      // toast with status message
      SpreadsheetApp.getActiveSpreadsheet().toast("Finished inserting " + (resp.data.length||"n/a") 
        + " Jira issues out of " + resp.totalFoundRecords + " total found records.", 
          "Status", 10);

    } else {
      // Something funky is up with the JSON response.
      response.message = "Failed to retrieve jira issues!";
      Browser.msgBox(response.message, Browser.Buttons.OK);
    }
  };

  var error = function(resp, status, errorMessage) {
    response.message = "Failed to retrieve jira issues from filter with status [" + status + "]!\\n" + errorMessage;
    Browser.msgBox(response.message, Browser.Buttons.OK);
  };

  var search = new Search(filter.jql);
  search.setOrderBy()
        .setFields(jsonFormData['columns'] || [])
        .setMaxResults(10000)
        .search()      
        .withSuccessHandler(ok)
        .withFailureHandler(error);

  return response;
}


/**
 * @desc
 * @param sheet {object}  SpreadsheetApp sheet
 * @param initRange {object}  SpreadsheetApp range
 * @param data {object}  (https://docs.atlassian.com/jira/REST/server/#api/2/search-searchUsingSearchRequest)
 * @return {IssueTable}
 */
function IssueTable(sheet, initRange, data) {
  var headers = ['key'], rowIndex = 0, numColumns = 0;

  /**
   * @desc Initialization, validation
   */
  this.init = function() {
    // check vars
    try {
      if( typeof data !== 'object'|| !data.hasOwnProperty('issues') ) {
        throw '{data} is not a valid Jira REST api issue response object.';
      }
      // sheet - how to verify if sheet is of type SpreadsheetApp
    } catch(err) {
      throw 'Fatal Error: ' + err;
    }

    // prep headers
    for(var k in data.issues[0].fields) {
      headers.push(k);
    }

    numColumns = headers.length;
  };

  /**
   * @desc Fill in all data into a sheet table with values and format
   * @return this  For chaining
   */
  this.fillTable = function() {
    var range = sheet.getRange(initRange.getRow(), initRange.getColumn(), 1, headers.length);

    // loop over each resulted issue
    for(var i=0; i<data.issues.length; i++) {
      var issue = data.issues[i];
      var values = [];
      var formats = []; //http://www.blackcj.com/blog/2015/05/18/cell-number-formatting-with-google-apps-script/
      range = sheet.getRange(initRange.getRow() + rowIndex++, initRange.getColumn(), 1, headers.length);

      // loop over each header (field/key to output in cell)
      for(var j=0; j<headers.length; j++) {
        var key = unifyIssueAttrib(headers[j], issue);

        // for some custom formatting
        switch(true) {
          case key.hasOwnProperty('date'):
            key.value = (key.value != null) ? key.date : '';
            break;
          case key.hasOwnProperty('link'):
            key.value = '=HYPERLINK("' + key.link + '"; "' + key.value + '")';
            break;
        }

        values.push( key.value );
        formats.push( key.format || '@' );
      }

      // just check if values (column) length is as we expect?!
      if( values.length != numColumns ) {
        for (var l = 0; l < values.length; l++) {
          values.push('');
          formats.push('@');
        }
      }

      // set values and format to cells
      range.clearContent()
        .clearNote()
        .clearFormat()
        .setValues([ values ])
        .setNumberFormats([ formats ])
        .activate();

      // flush sheet
      if(i % 5 === 0) {
        SpreadsheetApp.flush();
      }

      issue = null;

    }// END: for(data.issues.length)

    return this;
  };

  /**
   * @desc Add headers into 1st row
   * @return this  For chaining
   */
  this.addHeader = function() {
    var values = [], formats = [];
    for(var i=0; i<headers.length; i++) {
      values.push( headerNames(headers[i]) );
      formats.push('bold');
    }

    range = sheet.getRange(initRange.getRow() + rowIndex++, initRange.getColumn(), 1, headers.length);
    range.clearContent()
      .clearNote()
      .clearFormat()
      .setValues([ values ])
      .setFontWeights([ formats ]);
    
    SpreadsheetApp.flush();

    return this;
  };

  /**
   * @desc Adding a summary line
   * (not yet used)
   * @return this  For chaining
   */
  this.addSummary = function(summary) {
    range = sheet.getRange(initRange.getRow() + rowIndex++, initRange.getColumn(), 1, headers.length);
    //range.mergeAcross().setValue(summary);
    range.clearContent()
      .clearNote()
      .clearFormat()
      .getCell(1,1)
      .setValue(summary);
    
    SpreadsheetApp.flush();

    return this;
  };

  this.init();
}