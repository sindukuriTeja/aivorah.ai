const { parseHourField } = require('../../services/parseHourField');

describe('parseHourField', () => {
  test('null/undefined returns null', () => {
    expect(parseHourField(null)).toBeNull();
    expect(parseHourField(undefined)).toBeNull();
  });

  test('an "HH:MM" string returns the hour as an integer', () => {
    expect(parseHourField('14:00')).toBe(14);
    expect(parseHourField('09:30')).toBe(9);
  });

  test('a plain number (or numeric string without a colon) is coerced to Number', () => {
    expect(parseHourField(14)).toBe(14);
    expect(parseHourField('21')).toBe(21);
  });

  test('0 is a valid hour, not treated as missing', () => {
    expect(parseHourField(0)).toBe(0);
    expect(parseHourField('0')).toBe(0);
  });
});
