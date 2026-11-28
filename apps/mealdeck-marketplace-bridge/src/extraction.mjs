import { hash, integer, requireThat, timestamp } from "./contracts.mjs";

export async function one(transport, selector, scope = null) {
  const handles = await transport.find(selector, scope);
  if (handles.length !== 1) {
    await transport.dispose(handles);
    requireThat(false, "observation_incomplete");
  }
  return handles[0];
}

export async function readField(transport, field, scope = null) {
  if (field == null) return null;
  const handles = await transport.find(field.selector, scope);
  try {
    if (field.optional === true && handles.length === 0) return null;
    requireThat(handles.length === 1);
    let value =
      field.attribute === undefined
        ? await transport.text(handles[0])
        : await transport.attribute(handles[0], field.attribute);
    requireThat(typeof value === "string" && [...value].length <= 4096);
    if (field.trim === true) value = value.trim();
    if (field.capture !== undefined) {
      const result = new RegExp(field.capture, "u").exec(value);
      requireThat(result && result.length === 2 && result[1] !== undefined);
      value = result[1];
    }
    if (field.map !== undefined) {
      requireThat(Object.hasOwn(field.map, value));
      value = field.map[value];
    }
    switch (field.format ?? "text") {
      case "text":
        return value;
      case "integer":
      case "minor_units":
        requireThat(typeof value === "string" && /^(?:0|[1-9]\d{0,8})$/.test(value));
        return integer(Number(value));
      case "gbp": {
        // Locale is explicitly GBP; reject ambiguous decimals and never use floating point money.
        requireThat(typeof value === "string");
        const match = /^(?:£)?((?:0|[1-9]\d{0,7})|(?:[1-9]\d{0,2}(?:,\d{3}){1,2}))\.(\d{2})$/.exec(
          value,
        );
        requireThat(match !== null);
        return integer(Number(match[1].replaceAll(",", "")) * 100 + Number(match[2]));
      }
      case "iso_datetime":
        return timestamp(value);
      case "epoch_ms":
        requireThat(typeof value === "string" && /^\d{13}$/.test(value));
        return new Date(Number(value)).toISOString();
      default:
        requireThat(false, "profile_mismatch");
    }
  } finally {
    await transport.dispose(handles);
  }
}

export async function readItems(transport, spec, orderRoot) {
  const handles = await transport.find(spec.selector, orderRoot);
  try {
    const count = await readField(transport, spec.count, orderRoot);
    requireThat(count === handles.length && handles.length >= 1 && handles.length <= 200);
    const items = [];
    for (const root of handles) {
      const modifiers = [];
      if (spec.modifiers) {
        const modifierHandles = await transport.find(spec.modifiers.selector, root);
        try {
          requireThat(
            (await readField(transport, spec.modifiers.count, root)) === modifierHandles.length &&
              modifierHandles.length <= 100,
          );
          for (const modifier of modifierHandles)
            modifiers.push({
              name: await readField(transport, spec.modifiers.name, modifier),
              quantity: await readField(transport, spec.modifiers.quantity, modifier),
            });
        } finally {
          await transport.dispose(modifierHandles);
        }
      }
      items.push({
        externalLineId: await readField(transport, spec.externalLineId, root),
        name: await readField(transport, spec.name, root),
        quantity: await readField(transport, spec.quantity, root),
        unitPricePence: await readField(transport, spec.unitPricePence, root),
        modifiers,
        notes: await readField(transport, spec.notes, root),
      });
    }
    const occurrences = new Map();
    for (const item of items) {
      if (item.externalLineId !== null) continue;
      const digest = hash({ ...item, externalLineId: undefined });
      const occurrence = (occurrences.get(digest) ?? 0) + 1;
      occurrences.set(digest, occurrence);
      // This is explicitly a bridge line identity, never a vendor SKU or a guessed catalogue match.
      item.externalLineId = `ui:${digest}:${occurrence}`;
    }
    return items;
  } finally {
    await transport.dispose(handles);
  }
}
