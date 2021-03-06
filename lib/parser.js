/**
 * Module Dependencies
 */

var date = require('./date');
var debug = require('debug')('date:parser');

/**
 * Days
 */

var days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
var months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
              'october', 'november', 'december' ]

/**
 * Regexs
 */

// 5, 05, 5:30, 5.30, 05:30:10, 05:30.10, 05.30.10, at 5
var rMeridiem = /^(\d{1,2})([:.](\d{1,2}))?([:.](\d{1,2}))?\s*([ap]m)/;
var rHourMinute = /^(\d{1,2})([:.](\d{1,2}))([:.](\d{1,2}))?/;
var rAtHour = /^at\s?(\d{1,2})$/;
var rDays = /\b(sun(day)?|mon(day)?|tues(day)?|wed(nesday)?|thur(sday|s)?|fri(day)?|sat(urday)?)s?\b/;
var rMonths = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/;
var rMonthsWithDate1 = /^((\d{1,2})(st|nd|rd|th)?)\sof\s(january|february|march|april|may|june|july|august|september|october|november|december)/;
var rMonthsWithDate2 = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s(\d{1,2})(st|nd|rd|th)?\b([^:]|$)/;
var rPast = /\b(last|yesterday|ago)\b/;
var rDayMod = /\b(morning|noon|afternoon|night|evening|midnight|daytime|breakfast|lunch|dinner)\b/;
var rAgo = /^(\d*)\s?\b(second|minute|hour|day|week|month|year)[s]?\b\s?ago$/;


/*
 * Return object shallow copy
 *
 * @param {Object} obj
 * @return {Object}
 */
function copy(obj) {
    ret = {};
    for (var key in obj) {
        ret[key] = obj[key];
    }
    return ret;
}

/*
 * Return a difference between two objects as an object
 *
 * @param {Object} base
 * @param {Object} override
 * @return {Object}
 */
function difference(base, override) {
    var ret = {};
    for (var name in base) {
        if (base[name] !== override[name]) {
            ret[name] = override[name];
        }
    }
    return ret;
}

/**
 * Expose `parser`
 */

module.exports = parser;

/**
 * Initialize `parser`
 *
 * @param {String} str
 * @return {Date}
 * @api publics
 */

function parser(str, offset, multi) {
  if(!(this instanceof parser)) return new parser(str, offset, multi);
  if(typeof offset == 'string') offset = parser(offset);
  this.offset = offset || new Date;
  this.date = new date(this.offset);
  this.dates = [];
  this.original = str;
  this.str = str.toLowerCase();
  this.stash = [];
  this.tokens = [];
  this._chunks = [];

  var before = this.date.clone();
  var lastState = copy(this.date._changed);
  var advance = this.advance();
  var changed = {}, changedMemo = {};

  while (advance !== 'eos') {
    if (Object.keys(changed).length) {
      changedMemo = copy(changed);
    }
    changed = difference(lastState, this.date._changed);
    if (multi === true && Object.keys(changed).length) {
      if (Object.keys(changed).indexOf('month') > -1) {
        this.push(before);
      } else if (Object.keys(changed).indexOf('day') > -1 && Object.keys(this.date._changed).indexOf('hour') > -1) {
        this.push(before);
      } else if (Object.keys(changed).indexOf('day') > -1 && Object.keys(this.date._changed).indexOf('day') > -1) {
        this.push(before);
      } else if (Object.keys(changed).indexOf('hour') > -1 && Object.keys(changedMemo).indexOf('hour') > -1) {
        this.push(before);
      } else if (Object.keys(changed).indexOf('minute') > -1 && Object.keys(this.date._changed).indexOf('minute') > -1) {
        this.push(before);
      }
    }

    before = this.date.clone();
    lastState = copy(this.date._changed);
    advance = this.advance()
  };
  debug('tokens %j', this.tokens)

  this.push();

  if (multi) {
    return this.dates.map(function (d) { return d.date; });
  }
  if (this.date.date == this.offset) throw new Error('Invalid date');
  return this.date.date;
};

/**
 * Advance a token
 */

parser.prototype.advance = function() {
  var tok = this.eos()
    || this.space()
    || this._next()
    || this.last()
    || this.dayByName()
    || this.monthByName()
    || this.timeAgo()
    || this.ago()
    || this.yesterday()
    || this.tomorrow()
    || this.weekend()
    || this.noon()
    || this.midnight()
    || this.daytime()
    || this.breakfast()
    || this.brunch()
    || this.lunch()
    || this.dinner()
    || this.night()
    || this.evening()
    || this.afternoon()
    || this.morning()
    || this.tonight()
    || this.meridiem()
    || this.hourminute()
    || this.athour()
    || this.week()
    || this.month()
    || this.year()
    || this.second()
    || this.minute()
    || this.hour()
    || this.day()
    || this.number()
    || this.string()
    || this.other();

  this.tokens.push(tok);
  return tok;
};

/**
 * Push date object to the list of parsed dates
 */
parser.prototype.push = function (pushDate) {
  var dateSave;

  if (pushDate) {
    dateSave = this.date;
    this.date = new date(pushDate);
  }

  this.nextTime(this.offset);
  this.dates.push(this.date);

  if (pushDate) {
    this.date = dateSave;
  }
};

/**
 * Lookahead `n` tokens.
 *
 * @param {Number} n
 * @return {Object}
 * @api private
 */

parser.prototype.lookahead = function(n){
  var fetch = n - this.stash.length;
  if (fetch == 0) return this.lookahead(++n);
  while (fetch-- > 0) this.stash.push(this.advance());
  return this.stash[--n];
};

/**
 * Lookahead a single token.
 *
 * @return {Token}
 * @api private
 */

parser.prototype.peek = function() {
  return this.lookahead(1);
};

/**
 * Fetch next token including those stashed by peek.
 *
 * @return {Token}
 * @api private
 */

parser.prototype.next = function() {
  var tok = this.stashed() || this.advance();
  return tok;
};

/**
 * Return the next possibly stashed token.
 *
 * @return {Token}
 * @api private
 */

parser.prototype.stashed = function() {
  var stashed = this.stash.shift();
  return stashed;
};

/**
 * Consume the given `len`.
 *
 * @param {Number|Array} len
 * @api private
 */

parser.prototype.skip = function(len){
  var chunk = Array.isArray(len) ? len[0] : this.str.slice(0, len);
  if (chunk && chunk.replace(/\s/, '')) {
    this._chunks.push(chunk);
  }
  this.str = this.str.substr(Array.isArray(len) ? len[0].length : len);
};

/**
 * EOS
 */

parser.prototype.eos = function() {
  if (this.str.length) return;
  return 'eos';
};

/**
 * Space
 */

parser.prototype.space = function() {
  var captures;
  if (captures = /^([ \t]+)/.exec(this.str)) {
    this.skip(captures);
    return this.advance();
  }
};

/**
 * Second
 */

parser.prototype.second = function() {
  var captures;
  if (captures = /^s(ec|econd)?s?/.exec(this.str)) {
    this.skip(captures);
    return 'second';
  }
};

/**
 * Minute
 */

parser.prototype.minute = function() {
  var captures;
  if (captures = /^m(in|inute)?s?/.exec(this.str)) {
    this.skip(captures);
    return 'minute';
  }
};

/**
 * Hour
 */

parser.prototype.hour = function() {
  var captures;
  if (captures = /^h(r|our)s?/.exec(this.str)) {
    this.skip(captures);
    return 'hour';
  }
};

/**
 * Day
 */

parser.prototype.day = function() {
  var captures;
  if (captures = /^d(ay)?s?/.exec(this.str)) {
    this.skip(captures);
    return 'day';
  }
};

/**
 * Day by name
 */

parser.prototype.dayByName = function() {
  var captures;
  var r = new RegExp('^' + rDays.source);
  if (captures = r.exec(this.str)) {
    var day = captures[1];
    this.skip(captures);
    this.date[day](1);
    return captures[1];
  }
};


/**
 * Month by name
 */

parser.prototype.monthByName = function() {
  var captures, day, month;
  var rm = new RegExp('^' + rMonths.source);
  if (captures = rMonthsWithDate1.exec(this.str)) {
    day = captures[2]
    month = captures[4];
  } else if (captures = rMonthsWithDate2.exec(this.str)) {
    day = captures[2]
    month = captures[1];
  } else if (captures = rm.exec(this.str)) {
    day = this.date.date.getDate();
    month = captures[1];
  }
  if (captures) {
    this.date.date.setMonth((months.indexOf(month)));
    this.date._changed['month'] = months.indexOf(month);
    if (day) this.date.date.setDate(parseInt(day) - 1);
    this.skip(captures);
    return captures[0];
  }
};


parser.prototype.timeAgo = function() {
  var captures;
  if (captures = rAgo.exec(this.str)) {
    var num = captures[1];
    var mod = captures[2];
    this.date[mod](-num);
    this.skip(captures);
    return 'timeAgo';
  }
};

/**
 * Week
 */

parser.prototype.week = function() {
  var captures;
  if (captures = /^w(k|eek)s?/.exec(this.str)) {
    this.skip(captures);
    return 'week';
  }
};

/**
 * Month
 */

parser.prototype.month = function() {
  var captures;
  if (captures = /^mon(th)?(es|s)?\b/.exec(this.str)) {
    this.skip(captures);
    return 'month';
  }

};

/**
 * Week
 */

parser.prototype.year = function() {
  var captures;
  if (captures = /^y(r|ear)s?/.exec(this.str)) {
    this.skip(captures);
    return 'year';
  }
};

/**
 * Meridiem am/pm
 */

parser.prototype.meridiem = function() {
  var captures;
  if (captures = rMeridiem.exec(this.str)) {
    this.skip(captures);
    this.time(captures[1], captures[3], captures[5], captures[6]);
    return 'meridiem';
  }
};

/**
 * Hour Minute (ex. 12:30)
 */

parser.prototype.hourminute = function() {
  var captures;
  if (captures = rHourMinute.exec(this.str)) {
    this.skip(captures);
    this.time(captures[1], captures[3], captures[5]);
    return 'hourminute';
  }
};

/**
 * At Hour (ex. at 5)
 */

parser.prototype.athour = function() {
  var captures;
  if (captures = rAtHour.exec(this.str)) {
    this.skip(captures);
    this.time(captures[1], 0, 0, this._meridiem);
    this._meridiem = null;
    return 'athour';
  }
};

/**
 * Time set helper
 */

parser.prototype.time = function(h, m, s, meridiem) {
  var d = this.date;

  if (meridiem) {
    // convert to 24 hour
    h = ('pm' == meridiem && 12 > h) ? +h + 12 : h; // 6pm => 18
    h = ('am' == meridiem && 12 == h) ? 0 : h; // 12am => 0
  }

  m = (!m && d.changed('minute')) ? false : m;
  s = (!s && d.changed('second')) ? false : s;
  d.time(h, m, s);
};

/**
 * Best attempt to pick the next time this date will occur
 *
 * TODO: place at the end of the parsing
 */

parser.prototype.nextTime = function(before) {
  var d = this.date;
  var orig = this.original.toLowerCase();

  if (before <= d.date) {
    var m = d.date.getMonth();
    if (rMonths.test(orig) && d.daysInMonth(m) !== d.date.getDate()) d.day(1);
    return this;
  } else if (rPast.test(orig)) {
    return this;
  }

  // If time is in the past, we need to guess at the next time
  if (rDays.test(orig)) d.day(7);
  else if ((before - d.date) / 1000 > 60) d.day(1);

  return this;
};

/**
 * Yesterday
 */

parser.prototype.yesterday = function() {
  var captures;
  if (captures = /^(yes(terday)?)/.exec(this.str)) {
    this.skip(captures);
    this.date.day(-1);
    return 'yesterday';
  }
};

/**
 * Tomorrow
 */

parser.prototype.tomorrow = function() {
  var captures;
  if (captures = /^tom(orrow)?/.exec(this.str)) {
    this.skip(captures);
    this.date.day(1);
    return 'tomorrow';
  }
};

/**
 * Weekend
 */
parser.prototype.weekend = function () {
  var captures;
  if (captures = /^week[-]?end/.exec(this.str)) {
    this.skip(captures);
    this.date['saturday'](1);
    return 'weekend';
  }
}

/**
 * Noon
 */

parser.prototype.noon = function() {
  var captures;
  if (captures = /^noon\b/.exec(this.str)) {
    this.skip(captures);
    this.date.date.setHours(12, 0, 0);
    return 'noon';
  }
};

/**
 * Midnight
 */

parser.prototype.midnight = function() {
  var captures;
  if (captures = /^midnight\b/.exec(this.str)) {
    this.skip(captures);
    this.date.date.setHours(0, 0, 0);
    return 'midnight';
  }
};

/**
 * Daytime
 */

parser.prototype.daytime = function() {
  var captures;
  if (captures = /^daytime\b/.exec(this.str)) {
    this.skip(captures);
    this.date.date.setHours(14, 0, 0);
    return 'daytime';
  }
};

/**
 * Breakfast
 */
parser.prototype.breakfast = function () {
  var captures;
  if (captures = /^breakfast\b/.exec(this.str)) {
    this.skip(captures);
    this.date.date.setHours(8, 0, 0);
    return 'breakfast';
  }
};

/**
 * Brunch
 */
parser.prototype.brunch = function () {
  var captures;
  if (captures = /^brunch\b/.exec(this.str)) {
    this.skip(captures);
    this.date.date.setHours(10, 0, 0);
    return 'brunch';
  }
};

/**
 * Lunch
 */
parser.prototype.lunch = function () {
  var captures;
  if (captures = /^lunch\b/.exec(this.str)) {
    this.skip(captures);
    this.date.date.setHours(12, 0, 0);
    return 'lunch';
  }
};

/**
 * Dinner
 */
parser.prototype.dinner = function () {
  var captures;
  if (captures = /^dinner\b/.exec(this.str)) {
    this.skip(captures);
    this.date.date.setHours(17, 0, 0);
    return 'dinner';
  }
};

/**
 * Night (arbitrarily set at 7pm)
 */

parser.prototype.night = function() {
  var captures;
  if (captures = /^night\b/.exec(this.str)) {
    this.skip(captures);
    this._meridiem = 'pm';
    this.date.date.setHours(19, 0, 0);
    return 'night'
  }
};

/**
 * Evening (arbitrarily set at 5pm)
 */

parser.prototype.evening = function() {
  var captures;
  if (captures = /^evening\b/.exec(this.str)) {
    this.skip(captures);
    this._meridiem = 'pm';
    this.date.date.setHours(17, 0, 0);
    return 'evening'
  }
};

/**
 * Afternoon (arbitrarily set at 2pm)
 */

parser.prototype.afternoon = function() {
  var captures;
  if (captures = /^afternoon\b/.exec(this.str)) {
    this.skip(captures);
    this._meridiem = 'pm';

    if (this.date.changed('hour')) return 'afternoon';

    this.date.date.setHours(14, 0, 0);
    return 'afternoon';
  }
};


/**
 * Morning (arbitrarily set at 8am)
 */

parser.prototype.morning = function() {
  var captures;
  if (captures = /^morning\b/.exec(this.str)) {
    this.skip(captures);
    this._meridiem = 'am';
    if (!this.date.changed('hour')) this.date.date.setHours(8, 0, 0);
    return 'morning';
  }
};

/**
 * Tonight
 */

parser.prototype.tonight = function() {
  var captures;
  if (captures = /^tonight\b/.exec(this.str)) {
    this.skip(captures);
    this._meridiem = 'pm';
    return 'tonight';
  }
};

/**
 * Next time
 */

parser.prototype._next = function() {
  var captures;
  if (captures = /^next/.exec(this.str)) {
    this.skip(captures);
    var d = new Date(this.date.date);
    var mod = this.peek();

    // If we have a defined modifier, then update
    if (this.date[mod]) {
      this.next();
      // slight hack to modify already modified
      this.date = date(d);
      this.date[mod](1);
    } else if (rDayMod.test(mod)) {
      this.date.day(1);
    }

    return 'next';
  }
};

/**
 * Last time
 */

parser.prototype.last = function() {
  var captures;
  if (captures = /^last/.exec(this.str)) {
    this.skip(captures);
    var d = new Date(this.date.date);
    var mod = this.peek();

    // If we have a defined modifier, then update
    if (this.date[mod]) {
      this.next();
      // slight hack to modify already modified
      this.date = date(d);
      this.date[mod](-1);
    } else if (rDayMod.test(mod)) {
      this.date.day(-1);
    }

    return 'last';
  }
};

/**
 * Ago
 */

parser.prototype.ago = function() {
  var captures;
  if (captures = /^ago\b/.exec(this.str)) {
    this.skip(captures);
    return 'ago';
  }
};

/**
 * Number
 */

parser.prototype.number = function() {
  var captures;
  if (captures = /^(\d+)/.exec(this.str)) {
    var n = captures[1];
    this.skip(captures);
    var mod = this.peek();

    // If we have a defined modifier, then update
    if (this.date[mod]) {
      if ('ago' == this.peek()) n = -n;
      this.date[mod](n);
    } else if (this._meridiem) {
      // when we don't have meridiem, possibly use context to guess
      this.time(n, 0, 0, this._meridiem);
      this._meridiem = null;
    } else if (this._chunks[this._chunks.length - 3] === 'at') {
      this.time(n, 0, 0, this._meridiem);
      this._meridiem = null;
    }

    return 'number';
  }
};

/**
 * String
 */

parser.prototype.string = function() {
  var captures;
  if (captures = /^\w+/.exec(this.str)) {
    this.skip(captures);
    return 'string';
  }
};

/**
 * Other
 */

parser.prototype.other = function() {
  var captures;
  if (captures = /^./.exec(this.str)) {
    this.skip(captures);
    return 'other';
  }
};
