// Jest stub for static assets imported by production code (png, mp3, m4a, etc).
// Metro returns a numeric module handle at runtime; tests only need a truthy
// value of the same type, so we export a fixed non-zero number.
module.exports = 1;
