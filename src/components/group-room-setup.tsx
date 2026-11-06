import { useState } from "react";
import { ArrowRight, Car, Check, Clock3, Plus, Store, Trash2, Users } from "lucide-react";
import heroFeast from "@/assets/hero-feast.jpg";
import { PaymentIdentity } from "@/components/group-payments/payment-identity";
import type { PaymentIdentityState } from "@/components/group-payments/use-payment-identity";
import type { GroupOrderCapabilities, GroupOrderRequest } from "@/lib/mealdeck-group-rooms";
import { parseKerbsideVehicle } from "@/lib/mealdeck-opening-offer";
import { KERBSIDE_PARKING_INSTRUCTION } from "@/lib/mealdeck-customer-entry";

export type RoomCreationDetails = Omit<
  Extract<GroupOrderRequest, { action: "create" }>,
  "action" | "attemptId"
>;

export function GroupRoomSetup({
  identity,
  capabilities,
  busy,
  onCreate,
  onRefresh,
}: {
  identity: PaymentIdentityState;
  capabilities: GroupOrderCapabilities | null;
  busy: boolean;
  onCreate: (details: RoomCreationDetails) => void;
  onRefresh: () => void;
}) {
  const [name, setName] = useState("");
  const [inviteNames, setInviteNames] = useState<string[]>([""]);
  const [paymentMode, setPaymentMode] = useState<"separate" | "organiser">("separate");
  const [fulfilment, setFulfilment] = useState<"pickup" | "curbside">("pickup");
  const [vehicle, setVehicle] = useState({ make: "", colour: "", registrationLast4: "" });
  const [cutleryRequested, setCutleryRequested] = useState(false);
  const [issue, setIssue] = useState("");

  return (
    <div className="md-room-setup-layout">
      <section className="md-room-intro" aria-labelledby="room-how-heading">
        <img src={heroFeast} alt="A MealDeck feast with food to share" width={720} height={480} />
        <div className="md-room-intro-copy">
          <span className="md-room-kicker">One order, every craving</span>
          <h2 id="room-how-heading">
            Their favourites.
            <br />
            One collection.
          </h2>
          <ol className="md-room-how">
            <li>
              <span>1</span>
              <div>
                <strong>Invite them into your room</strong>
                <p>Each person gets their own invitation and has 3 minutes to join.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Everyone chooses their food</strong>
                <p>See who’s choosing and who’s ready. Every bag keeps its person’s name.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Pay your way, then we cook</strong>
                <p>
                  Each person pays for their food, or you cover the order. Once fully paid, one
                  order goes to the kitchen.
                </p>
              </div>
            </li>
          </ol>
          <p className="md-room-fine">
            <Clock3 size={16} aria-hidden="true" /> Only invitations that haven’t been accepted
            expire. People who join keep their place.
          </p>
        </div>
      </section>
      <div className="md-room-setup-form">
        <section className="md-room-card" aria-labelledby="room-create-heading">
          <span className="md-room-kicker">Get everyone together</span>
          <h2 id="room-create-heading">Create your room.</h2>
          <p className="md-room-muted">
            Up to 10 people, including you. Collection and kerbside at MealDeck Luton.
          </p>
          <form
            id="create-group-room"
            onSubmit={(event) => {
              event.preventDefault();
              setIssue("");
              if (!name.trim()) {
                setIssue("Add your name for the group.");
                return;
              }
              const checkedVehicle =
                fulfilment === "curbside" ? parseKerbsideVehicle(vehicle) : null;
              if (fulfilment === "curbside" && !checkedVehicle) {
                setIssue(
                  "Add the car make, colour and last 4 registration characters for kerbside collection.",
                );
                return;
              }
              onCreate({
                name: name.trim(),
                inviteNames: inviteNames.map((entry) => entry.trim()).filter(Boolean),
                paymentMode,
                fulfilment,
                ...(checkedVehicle ? { vehicle: checkedVehicle } : {}),
                cutleryRequested,
              });
            }}
          >
            <fieldset disabled={busy} className="md-room-fields">
              <legend className="sr-only">Room details</legend>
              <label>
                Your name on the bag
                <input
                  required
                  maxLength={32}
                  autoComplete="given-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Sam"
                />
              </label>
              <div className="md-room-invite-fields">
                <div className="md-room-section-title">
                  <Users size={20} aria-hidden="true" />
                  <h3>Who’s joining?</h3>
                </div>
                <p className="md-room-muted">
                  Use names your group and the kitchen will recognise.
                </p>
                {inviteNames.map((entry, index) => (
                  <div className="md-room-invite-field" key={index}>
                    <label>
                      <span>Person {index + 2}</span>
                      <input
                        maxLength={32}
                        value={entry}
                        autoComplete="off"
                        placeholder="Name for their invitation"
                        onChange={(event) =>
                          setInviteNames((current) =>
                            current.map((value, at) => (at === index ? event.target.value : value)),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="md-room-icon-button"
                      aria-label={"Remove person " + (index + 2)}
                      onClick={() =>
                        setInviteNames((current) => current.filter((_, at) => at !== index))
                      }
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {inviteNames.length < 9 && (
                  <button
                    type="button"
                    className="md-room-button md-room-button-light"
                    onClick={() => setInviteNames((current) => [...current, ""])}
                  >
                    <Plus size={18} aria-hidden="true" /> Add a person
                  </button>
                )}
              </div>
              <fieldset className="md-room-choice-fieldset">
                <legend>How will the group pay?</legend>
                <label
                  className={
                    "md-room-radio-card" + (paymentMode === "separate" ? " is-selected" : "")
                  }
                >
                  <input
                    type="radio"
                    name="room-payment-mode"
                    value="separate"
                    checked={paymentMode === "separate"}
                    onChange={() => setPaymentMode("separate")}
                  />
                  <span>
                    <strong>Everyone pays for their own food</strong>
                    <small>Each person reviews and pays their own itemised bill.</small>
                  </span>
                </label>
                <label
                  className={
                    "md-room-radio-card" + (paymentMode === "organiser" ? " is-selected" : "")
                  }
                >
                  <input
                    type="radio"
                    name="room-payment-mode"
                    value="organiser"
                    checked={paymentMode === "organiser"}
                    onChange={() => setPaymentMode("organiser")}
                  />
                  <span>
                    <strong>I’ll pay for everyone</strong>
                    <small>One payment, with a separate itemised bill for each person.</small>
                  </span>
                </label>
              </fieldset>
              <fieldset className="md-room-choice-fieldset">
                <legend>How are you collecting?</legend>
                <div className="md-room-collection-options">
                  <label
                    className={
                      "md-room-radio-card" + (fulfilment === "pickup" ? " is-selected" : "")
                    }
                  >
                    <input
                      type="radio"
                      name="room-fulfilment"
                      checked={fulfilment === "pickup"}
                      onChange={() => setFulfilment("pickup")}
                    />
                    <Store size={22} aria-hidden="true" />
                    <strong>Collection</strong>
                  </label>
                  <label
                    className={
                      "md-room-radio-card" + (fulfilment === "curbside" ? " is-selected" : "")
                    }
                  >
                    <input
                      type="radio"
                      name="room-fulfilment"
                      checked={fulfilment === "curbside"}
                      onChange={() => setFulfilment("curbside")}
                    />
                    <Car size={22} aria-hidden="true" />
                    <strong>Kerbside</strong>
                  </label>
                </div>
              </fieldset>
              {fulfilment === "curbside" && (
                <div className="md-room-vehicle-fields">
                  <p className="md-room-fine">{KERBSIDE_PARKING_INSTRUCTION}</p>
                  <label>
                    Car make
                    <input
                      required
                      minLength={2}
                      maxLength={60}
                      autoComplete="off"
                      value={vehicle.make}
                      onChange={(event) => setVehicle({ ...vehicle, make: event.target.value })}
                      placeholder="e.g. Ford"
                    />
                  </label>
                  <label>
                    Car colour
                    <input
                      required
                      minLength={2}
                      maxLength={40}
                      autoComplete="off"
                      value={vehicle.colour}
                      onChange={(event) => setVehicle({ ...vehicle, colour: event.target.value })}
                      placeholder="e.g. Blue"
                    />
                  </label>
                  <label>
                    Last 4 registration characters
                    <input
                      required
                      minLength={4}
                      maxLength={4}
                      pattern="[A-Za-z0-9]{4}"
                      autoComplete="off"
                      autoCapitalize="characters"
                      value={vehicle.registrationLast4}
                      onChange={(event) =>
                        setVehicle({
                          ...vehicle,
                          registrationLast4: event.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, ""),
                        })
                      }
                    />
                  </label>
                </div>
              )}
              <label className="md-room-checkbox">
                <input
                  type="checkbox"
                  checked={cutleryRequested}
                  onChange={(event) => setCutleryRequested(event.target.checked)}
                />
                <span>Please include cutlery for this order</span>
              </label>
            </fieldset>
            {issue && (
              <p className="md-room-error" role="alert">
                {issue}
              </p>
            )}
          </form>
          <p className="md-room-fine">
            Names and room progress are visible to the group. The kitchen gets names with each
            person’s food. Share each private invitation only with its intended person.
          </p>
        </section>
        {capabilities?.available && (
          <PaymentIdentity
            identity={identity}
            roomId=""
            disabled={busy}
            purpose="organiser"
            returnTo="/group-order"
            onRememberRoom={() => undefined}
            onGuestSaved={onRefresh}
          />
        )}
        <div className="md-room-card md-room-create-action">
          {!capabilities ? (
            <p role="status">Checking group ordering availability…</p>
          ) : !capabilities.available ? (
            <p className="md-room-notice">
              {capabilities.message ||
                "Group rooms are not available yet. You can still browse all five menus."}
            </p>
          ) : (
            <>
              <p className="md-room-fine">
                <Check size={17} aria-hidden="true" /> The 3-minute joining window starts when you
                create the room.
              </p>
              <button
                type="submit"
                form="create-group-room"
                className="md-room-button"
                disabled={busy || !identity.ready}
              >
                {busy ? "Creating room…" : "Create room & invite"}
                <ArrowRight size={19} aria-hidden="true" />
              </button>
              {!identity.ready && (
                <p className="md-room-fine">
                  Choose member or guest details above to organise the collection.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
