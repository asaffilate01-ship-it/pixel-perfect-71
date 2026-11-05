import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { TerminalApi } from "./api/client";
import type { MenuCatalogue, SaleSelection } from "./api/catalogue";
import type { TerminalQuote } from "./api/types";
import {
  addLaunchPick,
  cleanLaunchCrossConfiguration,
  encodeLaunchPicks,
  findLaunchMenuItem,
  getLaunchCrossOffers,
  isLaunchGroupActive,
  isMappedLaunchUpgradeOption,
  launchCrossSelectionSummaries,
  launchItemGroups,
  launchMenuPickDisplayPrice,
  launchSelectionLabels,
  missingLaunchChoices,
  setLaunchCrossChoice,
  setLaunchPickQuantity,
  toggleLaunchOption,
  type LaunchCrossSelection,
  type LaunchMenuBrand,
  type LaunchMenuItem,
  type LaunchMenuPick,
  type LaunchMenuSelections,
} from "./menu";
import { Button, Card, Notice } from "./ui";
import { money, styles } from "./theme";

export function SaleComposer({
  visible,
  api,
  onClose,
  onQuote,
}: {
  visible: boolean;
  api: TerminalApi;
  onClose(): void;
  onQuote(quote: TerminalQuote): void;
}) {
  const [catalogue, setCatalogue] = useState<MenuCatalogue | null>(null);
  const [brandId, setBrandId] = useState("");
  const [selected, setSelected] = useState<{ brand: LaunchMenuBrand; item: LaunchMenuItem } | null>(
    null,
  );
  const [selections, setSelections] = useState<LaunchMenuSelections>({});
  const [cross, setCross] = useState<LaunchCrossSelection[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [picks, setPicks] = useState<LaunchMenuPick[]>([]);
  const [fulfilment, setFulfilment] = useState<"pickup" | "curbside">("pickup");
  const [make, setMake] = useState("");
  const [colour, setColour] = useState("");
  const [registration, setRegistration] = useState("");
  const [cutlery, setCutlery] = useState(false);
  const [separate, setSeparate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadMenu = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const next = await api.catalogue();
      setCatalogue(next);
      setBrandId((value) => value || next.brands[0]!.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The current menu could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, [api]);
  useEffect(() => {
    if (visible) void loadMenu();
  }, [visible, loadMenu]);
  const brand = catalogue?.brands.find((entry) => entry.id === brandId);
  const missing = selected
    ? missingLaunchChoices(selected.brand, selected.item, selections, cross)
    : [];
  const sourcePrice = selected
    ? launchMenuPickDisplayPrice({
        brandId: selected.brand.id,
        itemId: selected.item.id,
        quantity,
        selections,
        crossSelections: cross,
      }).itemsSubtotalPence
    : null;

  async function review() {
    if (busy || !picks.length) return;
    setBusy(true);
    setMessage("");
    try {
      const input: SaleSelection = {
        picks: (JSON.parse(encodeLaunchPicks(picks)) as { picks: SaleSelection["picks"] }).picks,
        fulfilment,
        ...(fulfilment === "curbside"
          ? {
              vehicle: {
                make: make.trim(),
                colour: colour.trim(),
                registrationLast4: registration.toUpperCase(),
              },
            }
          : {}),
        packing: {
          cutleryRequested: cutlery,
          separateBags: separate,
          bagCount: separate ? picks.length : 1,
          allocations: separate
            ? picks.map((pick, index) => ({
                lineId: "line-" + (index + 1),
                bag: index + 1,
                quantity: pick.quantity,
              }))
            : [],
        },
      };
      const quote = await api.quote(input);
      onQuote(quote);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The current kitchen total could not be checked.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{selected ? selected.item.name : "New staff sale"}</Text>
          <Button
            secondary
            title={selected ? "Back to menu" : "Close sale"}
            disabled={busy}
            onPress={() => (selected ? setSelected(null) : onClose())}
          />
          {!!message && <Notice warning>{message}</Notice>}
          {!catalogue && (
            <Button
              title={busy ? "Loading current menu…" : "Load menu"}
              disabled={busy}
              onPress={() => void loadMenu()}
            />
          )}
          {catalogue && selected ? (
            <>
              {!!selected.item.description && (
                <Text style={styles.body}>{selected.item.description}</Text>
              )}
              {launchItemGroups(selected.brand, selected.item)
                .filter((group) => isLaunchGroupActive(group, selections, selected.item, cross))
                .map((group) => (
                  <Card key={group.id}>
                    <Text style={styles.heading}>
                      {group.label}
                      {group.required ? " · required" : " · optional"}
                    </Text>
                    {group.options
                      .filter((option) => !isMappedLaunchUpgradeOption(option.id))
                      .map((option) => {
                        const checked = !!selections[group.id]?.includes(option.id);
                        return (
                          <Pressable
                            key={option.id}
                            accessibilityRole={group.kind === "single" ? "radio" : "checkbox"}
                            accessibilityState={{ checked, disabled: option.available === false }}
                            disabled={option.available === false}
                            style={[
                              styles.chip,
                              checked && styles.selected,
                              option.available === false && styles.disabled,
                            ]}
                            onPress={() => {
                              const next = toggleLaunchOption(
                                selected.brand,
                                selected.item,
                                selections,
                                group.id,
                                option.id,
                              );
                              const clean = cleanLaunchCrossConfiguration(
                                selected.brand,
                                selected.item,
                                next,
                                cross,
                              );
                              setSelections(clean.selections);
                              setCross(clean.crossSelections);
                            }}
                          >
                            <Text style={styles.body}>
                              {option.label}
                              {option.pricePence ? " · +" + money(option.pricePence) : ""}
                            </Text>
                            {option.available === false && (
                              <Text style={styles.small}>
                                {option.unavailableReason ?? "Unavailable"}
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}
                  </Card>
                ))}
              {getLaunchCrossOffers(selected.brand, selected.item, selections).map((offer) => (
                <Card key={offer.id}>
                  <Text style={styles.heading}>{offer.title}</Text>
                  <Text style={styles.small}>{offer.description}</Text>
                  <Button
                    secondary
                    title="None"
                    onPress={() => {
                      const next = setLaunchCrossChoice(
                        selected.brand,
                        selected.item,
                        selections,
                        cross,
                        offer.id,
                        null,
                      );
                      setSelections(next.selections);
                      setCross(next.crossSelections);
                    }}
                  />
                  {offer.choices
                    .filter((choice) =>
                      catalogue.brands.some(
                        (entry) =>
                          entry.id === choice.brandId &&
                          entry.sections.some((section) =>
                            section.items.some((item) => item.id === choice.itemId),
                          ),
                      ),
                    )
                    .map((choice) => {
                      const checked = cross.some(
                        (value) =>
                          value.slot === offer.slot &&
                          value.itemId === choice.itemId &&
                          value.mode === offer.mode,
                      );
                      return (
                        <Pressable
                          key={choice.itemId}
                          accessibilityRole="radio"
                          accessibilityState={{ checked }}
                          style={[styles.chip, checked && styles.selected]}
                          onPress={() => {
                            const next = setLaunchCrossChoice(
                              selected.brand,
                              selected.item,
                              selections,
                              cross,
                              offer.id,
                              choice.itemId,
                            );
                            setSelections(next.selections);
                            setCross(next.crossSelections);
                          }}
                        >
                          <Text style={styles.body}>{choice.name}</Text>
                        </Pressable>
                      );
                    })}
                </Card>
              ))}
              <View style={styles.row}>
                <Button
                  secondary
                  title="−"
                  disabled={quantity <= 1}
                  onPress={() => setQuantity((value) => value - 1)}
                />
                <Text style={styles.heading}>Quantity {quantity}</Text>
                <Button
                  secondary
                  title="+"
                  disabled={quantity >= 20}
                  onPress={() => setQuantity((value) => value + 1)}
                />
              </View>
              {!!missing.length && (
                <Notice>Choose {missing.map((group) => group.label).join(", ")}.</Notice>
              )}
              {sourcePrice !== null && (
                <Text style={styles.small}>
                  Menu estimate: {money(sourcePrice)}. The kitchen confirms the total at review.
                </Text>
              )}
              <Button
                title="Add to sale"
                disabled={!!missing.length}
                onPress={() => {
                  const next = addLaunchPick(
                    picks,
                    selected.brand.id,
                    selected.item.id,
                    selections,
                    quantity,
                    cross,
                  );
                  if (next === picks) {
                    setMessage(
                      "Keep this sale to 60 selections and 20 of each exact configuration.",
                    );
                    return;
                  }
                  if (separate && next.length > 10) {
                    setMessage(
                      "Separate packing supports ten bags. Switch to packing together or remove a basket line before adding another.",
                    );
                    return;
                  }
                  setPicks(next);
                  setSelected(null);
                  setMessage("");
                }}
              />
            </>
          ) : (
            catalogue && (
              <>
                <Notice>{catalogue.notice}</Notice>
                <View style={styles.wrap}>
                  {catalogue.brands.map((entry) => (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected: entry.id === brandId }}
                      key={entry.id}
                      style={[styles.chip, entry.id === brandId && styles.selected]}
                      onPress={() => setBrandId(entry.id)}
                    >
                      <Text style={styles.label}>{entry.name}</Text>
                    </Pressable>
                  ))}
                </View>
                {brand?.sections.map((section) => (
                  <Card key={section.id}>
                    <Text style={styles.heading}>{section.title}</Text>
                    {section.items.map((item) => (
                      <Button
                        secondary
                        key={item.id}
                        title={
                          item.name +
                          (item.pricePence !== null
                            ? " · " + (item.priceVariants ? "from " : "") + money(item.pricePence)
                            : "")
                        }
                        onPress={() => {
                          setSelected({ brand, item });
                          setSelections({});
                          setCross([]);
                          setQuantity(1);
                          setMessage("");
                        }}
                      />
                    ))}
                  </Card>
                ))}
                <Card>
                  <Text style={styles.heading}>
                    Sale basket · {picks.reduce((sum, pick) => sum + pick.quantity, 0)} selections
                  </Text>
                  {!picks.length && (
                    <Text style={styles.body}>Choose dishes from any of the five brands.</Text>
                  )}
                  {picks.map((pick) => {
                    const found = findLaunchMenuItem(pick.brandId, pick.itemId)!;
                    const choices = [
                      ...launchSelectionLabels(
                        found.brand,
                        found.item,
                        pick.selections,
                        pick.crossSelections,
                      ),
                      ...launchCrossSelectionSummaries(
                        found.brand,
                        found.item,
                        pick.selections,
                        pick.crossSelections ?? [],
                      ).map((choice) => choice.label),
                    ];
                    const price = launchMenuPickDisplayPrice(pick).itemsSubtotalPence;
                    return (
                      <View key={pick.key} style={{ gap: 8 }}>
                        <Text style={styles.label}>
                          {pick.quantity} × {found.item.name}
                        </Text>
                        {!!choices.length && (
                          <Text style={styles.small}>{choices.join(" · ")}</Text>
                        )}
                        <View style={styles.row}>
                          <Button
                            secondary
                            title={pick.quantity === 1 ? "Remove" : "−"}
                            onPress={() =>
                              setPicks(setLaunchPickQuantity(picks, pick.key, pick.quantity - 1))
                            }
                          />
                          <Text style={styles.body}>
                            {price === null ? "Check kitchen total" : money(price)}
                          </Text>
                          <Button
                            secondary
                            title="+"
                            disabled={pick.quantity >= 20}
                            onPress={() =>
                              setPicks(setLaunchPickQuantity(picks, pick.key, pick.quantity + 1))
                            }
                          />
                        </View>
                        <View style={styles.separator} />
                      </View>
                    );
                  })}
                  {!!picks.length && (
                    <Button
                      secondary
                      title="Clear this basket"
                      onPress={() => {
                        setPicks([]);
                        setSeparate(false);
                      }}
                    />
                  )}
                </Card>
                <Card>
                  <Text style={styles.heading}>Collection and packing</Text>
                  <View style={styles.wrap}>
                    {(["pickup", "curbside"] as const).map((value) => (
                      <Pressable
                        key={value}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: fulfilment === value }}
                        style={[styles.chip, fulfilment === value && styles.selected]}
                        onPress={() => setFulfilment(value)}
                      >
                        <Text style={styles.body}>
                          {value === "pickup" ? "Walk-in / pickup" : "Kerbside"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {fulfilment === "curbside" && (
                    <>
                      <TextInput
                        style={styles.input}
                        accessibilityLabel="Car make"
                        placeholder="Car make"
                        value={make}
                        onChangeText={setMake}
                        maxLength={40}
                      />
                      <TextInput
                        style={styles.input}
                        accessibilityLabel="Car colour"
                        placeholder="Car colour"
                        value={colour}
                        onChangeText={setColour}
                        maxLength={40}
                      />
                      <TextInput
                        style={styles.input}
                        accessibilityLabel="Last four registration characters"
                        placeholder="Last 4 registration characters"
                        value={registration}
                        onChangeText={(value) =>
                          setRegistration(value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                        }
                        maxLength={4}
                        autoCapitalize="characters"
                      />
                    </>
                  )}
                  <View style={styles.row}>
                    <Text style={[styles.body, { flex: 1 }]}>Include cutlery</Text>
                    <Switch
                      accessibilityLabel="Include cutlery"
                      value={cutlery}
                      onValueChange={setCutlery}
                    />
                  </View>
                  <View style={styles.row}>
                    <Text style={[styles.body, { flex: 1 }]}>
                      One numbered bag per basket line, keeping its extras together
                    </Text>
                    <Switch
                      accessibilityLabel="One bag per basket line"
                      value={separate && picks.length <= 10}
                      disabled={!picks.length || picks.length > 10}
                      onValueChange={setSeparate}
                    />
                  </View>
                  <Button
                    title={busy ? "Checking kitchen total…" : "Review current kitchen total"}
                    disabled={
                      busy ||
                      !picks.length ||
                      (separate && picks.length > 10) ||
                      (fulfilment === "curbside" &&
                        (!make.trim() || !colour.trim() || registration.length !== 4))
                    }
                    onPress={() => void review()}
                  />
                </Card>
              </>
            )
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
