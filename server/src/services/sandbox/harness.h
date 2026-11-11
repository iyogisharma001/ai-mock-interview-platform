// Test harness compiled together with the candidate's C++ solution inside the sandbox.
// It reads test inputs from /workspace/tests.json, calls the candidate's function and reports what
// it returned. Expected values never enter the container: the host does the comparison.
#include <bits/stdc++.h>
using namespace std;

namespace sbx {

// Minimal JSON reader for the value shapes test inputs use: numbers, booleans, strings, arrays.
struct Reader {
  const char* p;
  bool first = true;

  void ws() { while (*p == ' ' || *p == '\n' || *p == '\t' || *p == '\r') ++p; }
  bool eat(char c) { ws(); if (*p == c) { ++p; return true; } return false; }
  void expect(char c) { if (!eat(c)) throw runtime_error(string("harness: malformed test input near '") + string(p, strnlen(p, 12)) + "'"); }

  void read(bool& v) {
    ws();
    if (!strncmp(p, "true", 4)) { v = true; p += 4; }
    else if (!strncmp(p, "false", 5)) { v = false; p += 5; }
    else throw runtime_error("harness: expected a boolean");
  }
  void read(double& v) { ws(); char* end; v = strtod(p, &end); if (end == p) throw runtime_error("harness: expected a number"); p = end; }
  void read(long long& v) { double d; const char* start = (ws(), p); char* end; v = strtoll(p, &end, 10); if (end == p) throw runtime_error("harness: expected an integer"); if (*end == '.' || *end == 'e' || *end == 'E') { p = start; read(d); v = (long long)d; } else p = end; }
  void read(int& v) { long long wide; read(wide); v = (int)wide; }
  void read(string& v) {
    expect('"');
    v.clear();
    while (*p && *p != '"') {
      if (*p != '\\') { v += *p++; continue; }
      ++p;
      switch (*p) {
        case 'n': v += '\n'; break;
        case 't': v += '\t'; break;
        case 'r': v += '\r'; break;
        case 'u': v += (char)strtoul(string(p + 1, 4).c_str(), nullptr, 16); p += 4; break;
        default: v += *p;
      }
      ++p;
    }
    expect('"');
  }
  void read(char& v) { string s; read(s); v = s.empty() ? '\0' : s[0]; }
  template <class T> void read(vector<T>& v) {
    v.clear();
    expect('[');
    if (eat(']')) return;
    do { T item; read(item); v.push_back(std::move(item)); } while (eat(','));
    expect(']');
  }

  // Next positional argument of the current test.
  template <class T> void arg(T& v) { if (!first) expect(','); first = false; read(v); }
};

struct Writer {
  string s;
  void put(bool v) { s += v ? "true" : "false"; }
  void put(int v) { s += to_string(v); }
  void put(unsigned v) { s += to_string(v); }
  void put(long v) { s += to_string(v); }
  void put(unsigned long v) { s += to_string(v); }
  void put(long long v) { s += to_string(v); }
  void put(unsigned long long v) { s += to_string(v); }
  void put(double v) { char buf[40]; snprintf(buf, sizeof buf, "%.12g", v); s += (isfinite(v) ? buf : "null"); }
  void put(char v) { put(string(1, v)); }
  void put(const char* v) { put(string(v)); }
  void put(const string& v) {
    s += '"';
    for (unsigned char c : v) {
      if (c == '"' || c == '\\') { s += '\\'; s += (char)c; }
      else if (c == '\n') s += "\\n";
      else if (c == '\t') s += "\\t";
      else if (c < 0x20) { char buf[8]; snprintf(buf, sizeof buf, "\\u%04x", c); s += buf; }
      else s += (char)c;
    }
    s += '"';
  }
  void put(const vector<bool>& v) { s += '['; for (size_t i = 0; i < v.size(); ++i) { if (i) s += ','; put((bool)v[i]); } s += ']'; }
  template <class T> void put(const vector<T>& v) { s += '['; for (size_t i = 0; i < v.size(); ++i) { if (i) s += ','; put(v[i]); } s += ']'; }
  template <class T> void value(const T& v) { put(v); }
};

// `body` parses one test's arguments, calls the candidate and writes the returned value.
template <class Body> int run(int argc, char** argv, Body body) {
  const string sentinel = argc > 1 ? argv[1] : "";
  ifstream file("/workspace/tests.json");
  stringstream buffer;
  buffer << file.rdbuf();
  const string text = buffer.str();
  const size_t at = text.find("\"tests\":");
  if (at == string::npos) { fprintf(stderr, "harness: tests.json is missing\n"); return 2; }

  Reader in{text.c_str() + at + 8};
  in.expect('[');
  int index = 0;
  if (!in.eat(']')) {
    do {
      in.expect('[');
      in.first = true;
      Writer out;
      Writer error;
      bool ok = true;
      const auto started = chrono::steady_clock::now();
      try { body(in, out); }
      catch (const exception& e) { ok = false; error.put(string(e.what())); }
      catch (...) { ok = false; error.put("unknown exception"); }
      const double ms = chrono::duration<double, milli>(chrono::steady_clock::now() - started).count();
      in.expect(']');

      printf("> test %d executed in %.2f ms\n", index + 1, ms);
      if (ok) printf("\n%s{\"type\":\"test\",\"index\":%d,\"ok\":true,\"actual\":%s,\"ms\":%.3f}\n", sentinel.c_str(), index, out.s.c_str(), ms);
      else printf("\n%s{\"type\":\"test\",\"index\":%d,\"ok\":false,\"error\":%s,\"ms\":%.3f}\n", sentinel.c_str(), index, error.s.c_str(), ms);
      fflush(stdout);
      ++index;
    } while (in.eat(','));
    in.expect(']');
  }
  printf("\n%s{\"type\":\"done\"}\n", sentinel.c_str());
  fflush(stdout);
  return 0;
}

}  // namespace sbx
