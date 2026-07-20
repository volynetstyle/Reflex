import {
  COMPONENT_RENDERABLE,
  ELEMENT_RENDERABLE,
  type ComponentRenderable,
  type ElementRenderable,
  type JSXRenderable,
} from "../../../src/types/renderable";

type TerminalColor =
  | "blue"
  | "bold"
  | "cyan"
  | "dim"
  | "green"
  | "red"
  | "yellow";

export const supportsColor =
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== "dumb" &&
  process.stdout.isTTY === true;

export const supportsDashboard =
  process.env.CI === undefined &&
  process.env.TERM !== "dumb" &&
  process.stdout.isTTY === true;

const colorCodes: Record<TerminalColor, string> = {
  blue: "34",
  bold: "1",
  cyan: "36",
  dim: "2",
  green: "32",
  red: "31",
  yellow: "33",
};

export function paint(color: TerminalColor, value: string): string {
  if (!supportsColor) return value;
  return `\x1b[${colorCodes[color]}m${value}\x1b[0m`;
}

export function statusSymbol(status: string): string {
  switch (status) {
    case "building":
    case "running":
      return paint("blue", "в–¶");
    case "completed":
      return paint("green", "вњ“");
    case "cached":
      return paint("yellow", "вљЎ");
    case "failed":
      return paint("red", "вњ–");
    default:
      return paint("dim", "в–Ў");
  }
}

class StringSink {
  private chunks: string[] = [];

  write(value: string): void {
    this.chunks.push(value);
  }

  reset(): void {
    this.chunks.length = 0;
  }

  toString(): string {
    return this.chunks.join("");
  }
}

export class TerminalBuffer {
  private buffer = Buffer.allocUnsafe(4096);
  private offset = 0;

  reset(): void {
    this.offset = 0;
  }

  writeByte(byte: number): void {
    this.ensure(1);
    this.buffer[this.offset] = byte;
    this.offset += 1;
  }

  writeASCII(value: string): void {
    this.ensure(value.length);
    this.offset += this.buffer.write(value, this.offset, value.length, "ascii");
  }

  writeUTF8(value: string): void {
    const length = Buffer.byteLength(value);
    this.ensure(length);
    this.offset += this.buffer.write(value, this.offset, length, "utf8");
  }

  toBuffer(): Buffer {
    return this.buffer.subarray(0, this.offset);
  }

  private ensure(size: number): void {
    const required = this.offset + size;
    if (required <= this.buffer.length) return;
    let nextLength = this.buffer.length;
    while (nextLength < required) nextLength *= 2;
    const next = Buffer.allocUnsafe(nextLength);
    this.buffer.copy(next, 0, 0, this.offset);
    this.buffer = next;
  }
}

function renderChildInto(
  sink: StringSink,
  child: JSXRenderable<unknown>,
): void {
  if (child === null || child === undefined || typeof child === "boolean")
    return;
  if (
    typeof child === "string" ||
    typeof child === "number" ||
    typeof child === "bigint"
  ) {
    sink.write(String(child));
    return;
  }
  if (typeof child === "function") {
    renderChildInto(sink, child());
    return;
  }
  if (typeof child !== "object") return;

  const record = child as Partial<
    ElementRenderable<string, Record<string, unknown>>
  > &
    Partial<ComponentRenderable<Record<string, unknown>, unknown>>;

  if (record.kind === COMPONENT_RENDERABLE && record.type !== undefined) {
    renderChildInto(sink, record.type(record.props ?? {}));
    return;
  }
  if (record.kind === ELEMENT_RENDERABLE && record.tag !== undefined) {
    const props = (record.props ?? {}) as Record<string, unknown>;
    if (record.tag === "line") {
      renderChildInto(sink, props.children as JSXRenderable<unknown>);
      sink.write("\n");
      return;
    }
    if (record.tag === "text") {
      const valueSink = new StringSink();
      renderChildInto(valueSink, props.children as JSXRenderable<unknown>);
      const color = props.color as TerminalColor | undefined;
      sink.write(
        color === undefined
          ? valueSink.toString()
          : paint(color, valueSink.toString()),
      );
      return;
    }
    if (record.tag === "indent") {
      sink.write(" ".repeat(typeof props.size === "number" ? props.size : 4));
      renderChildInto(sink, props.children as JSXRenderable<unknown>);
      return;
    }
    renderChildInto(sink, props.children as JSXRenderable<unknown>);
    return;
  }
  if (Symbol.iterator in child) {
    for (const item of child as Iterable<JSXRenderable<unknown>>)
      renderChildInto(sink, item);
  }
}

const stringSink = new StringSink();

export function renderTerminal(view: JSXRenderable<unknown>): string {
  stringSink.reset();
  renderChildInto(stringSink, view);
  const output = stringSink.toString();
  return output.endsWith("\n") ? output.slice(0, -1) : output;
}
