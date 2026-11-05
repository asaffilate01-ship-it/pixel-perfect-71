import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { seo } from "@/lib/seo";
import "@/styles.launch-opening.css";

export const Route = createFileRoute("/privacy")({
  head: () =>
    seo({
      title: "Privacy and your choices | MealDeck",
      description:
        "How MealDeck uses account, order and kerbside details, and how you control optional marketing emails and app notifications.",
      path: "/privacy",
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="md-marketing-shell">
      <SiteHeader />
      <main className="md-info-page">
        <article className="md-info-inner">
          <p className="lm-eyebrow">Your details. Your choices.</p>
          <h1>MealDeck privacy notice</h1>
          <p>Updated 5 November 2026</p>
          <h2>Who is responsible?</h2>
          <p>
            MealDeck is a trading name of 313 Brands Ltd, the controller responsible for the
            personal information described here. Contact{" "}
            <a href="mailto:info@mealdeck.co.uk">info@mealdeck.co.uk</a> about privacy or your
            rights. Our Luton collection location is 314–318 Selbourne Road, Luton, LU4 8NU.
          </p>
          <h2>Registering and signing in</h2>
          <p>
            We ask for your name, email address and mobile number to create your account, verify
            your email, identify your order and contact you about collection or a problem with an
            order. Your email is verified through a link or code sent to you. We do not ask for a
            delivery address when you register.
          </p>
          <p>
            We use these details to provide the account and ordering services you request. Necessary
            security checks, access records and fraud prevention support our legitimate interest in
            protecting customers and the service. We do not use an email verification message as
            permission to send marketing.
          </p>
          <h2>Ordering as a guest</h2>
          <p>
            During our opening hours on 6–8 November 2026, you can order without registering. We use
            your name, email and mobile number to fulfil that order and handle related queries. This
            does not create a member account or give permission for marketing. Guest orders earn no
            loyalty points.
          </p>
          <p>
            A necessary guest session cookie keeps your receipt available to the browser you used to
            order for up to 30 days. Keep your receipt page available on that device. If you clear
            its cookies, the session expires or you use a different device, contact us with your
            order details for help.
          </p>
          <h2>Ordering, payment and collection</h2>
          <p>
            We use your basket, choices, order details, payment references and fulfilment details to
            take and prepare your order, provide updates, deal with queries and process any refunds.
            Payment card information is entered securely with Stripe. MealDeck does not store your
            full card number or security code.
          </p>
          <p>
            For collection, we need your contact and order details. For kerbside pickup, we also ask
            for the car make, colour and last four characters of the registration so our team can
            find the right vehicle. We do not ask for your full registration. Your delivery address
            is requested only if you choose delivery.
          </p>
          <p>
            We process order information to fulfil our contract with you and keep transaction
            records where required for accounting and other legal obligations. Relevant kitchen
            staff receive the information needed to prepare and hand over your order. If delivery
            becomes available and you choose it, the delivery provider receives the details needed
            to complete that delivery.
          </p>
          <h2>Opening offers and loyalty</h2>
          <p>
            The 6–8 November opening offer is available to guests and members during our published
            opening hours. We check your order’s fulfilment method and time to confirm eligibility.
            Member-only offers require a registered, verified account. Marketing consent is not
            required to receive an eligible discount.
          </p>
          <p>
            When the loyalty programme launches, your account may hold a points balance and a record
            of qualifying purchases and adjustments. Earning and redemption rules will be shown
            before the programme becomes available. Promotional updates about rewards remain
            optional.
          </p>
          <h2>Optional emails and notifications</h2>
          <p>
            Promotional emails and promotional app notifications are available to registered members
            who opt in. You choose each separately, and both are off by default. A guest order is
            not an opt-in. We record your choice, the notice version and when it changed so we can
            respect and demonstrate your consent.
          </p>
          <p>
            You can change these choices in <Link to="/account">your account</Link> or contact us.
            Marketing emails must include an unsubscribe option. Withdrawing consent stops future
            marketing through that channel and does not affect your account, order updates or
            eligibility for offers.
          </p>
          <p>
            App notifications also need permission from your device or browser. We only ask after
            you choose to enable them. A browser permission by itself is not marketing consent.
            Order notifications have a separate preference from promotional alerts. You can withdraw
            permission in your browser or device settings as well as changing your MealDeck
            preferences.
          </p>
          <p>
            If you enable app notifications, we store the subscription details needed to deliver
            them to that browser. Delivery depends on your device, browser and connection. Avoid
            enabling notifications on a shared device if you do not want others to see them.
          </p>
          <h2>Cookies, browser storage and the app</h2>
          <p>
            Necessary browser storage keeps you signed in, remembers the basket on your device and
            remembers an app-install invitation dismissed during your visit. Guest checkout uses a
            necessary session cookie to protect access to your order. The app’s offline cache
            contains its public offline screen and artwork; it does not cache account details,
            payments or live order progress.
          </p>
          <p>
            Installing the app is optional and is separate from enabling notifications. This
            registration and ordering flow does not require advertising cookies or marketing
            consent.
          </p>
          <h2>Service providers and sharing</h2>
          <p>
            We use hosting and database/authentication services provided through Lovable and
            Supabase, Stripe for payments, and necessary email and browser notification services.
            They process information needed to provide these services under their applicable terms
            and safeguards. Dishbee provides the technology; MealDeck uses its own dedicated
            database.
          </p>
          <p>
            We do not sell your personal information. Access is limited to authorised people and
            providers with a service-related need. Where a provider processes information outside
            the UK, applicable data protection safeguards must cover that transfer.
          </p>
          <h2>How long we keep information</h2>
          <p>
            Account information is kept while your account is in use or needed to provide the
            service. Order and payment records may need to be retained for accounting, disputes and
            legal obligations after an account closes. Kerbside details are used for handoff and
            related order queries, not for marketing.
          </p>
          <p>
            Consent records and a minimal suppression record may be kept to demonstrate your choices
            and prevent further unwanted messages. Contact us to request deletion or details of the
            retention period that applies to your records. Closing an account does not require
            retaining unnecessary profile or browser-subscription information.
          </p>
          <h2>Your rights</h2>
          <p>
            You can ask for access to your information, correction, erasure, restriction or a
            portable copy where applicable. You may object to processing based on legitimate
            interests and can always object to direct marketing. We may need to verify your identity
            before acting on a request.
          </p>
          <p>
            Contact <a href="mailto:info@mealdeck.co.uk">info@mealdeck.co.uk</a> to exercise these
            rights or raise a concern. You can also complain to the UK Information Commissioner’s
            Office at{" "}
            <a
              href="https://ico.org.uk/make-a-complaint/"
              target="_blank"
              rel="noopener noreferrer"
            >
              ico.org.uk
            </a>
            .
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
