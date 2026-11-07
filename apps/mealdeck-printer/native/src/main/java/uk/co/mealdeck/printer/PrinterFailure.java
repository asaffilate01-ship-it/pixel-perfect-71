package uk.co.mealdeck.printer;

/** Fixed public codes only; never relay HTTP, SQLite or vendor exception text. */
final class PrinterFailure extends RuntimeException {
    final String code;
    PrinterFailure(String code) { super(code); this.code = code; }
    static PrinterFailure network() { return new PrinterFailure("network_unavailable"); }
}
