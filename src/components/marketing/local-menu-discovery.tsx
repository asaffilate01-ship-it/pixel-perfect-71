import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { MEALDECK_MENU_PAGES } from "@/lib/mealdeck-menu-seo";
import "@/styles.local-menu-discovery.css";

/** Crawlable links to the actual menus, shared by the homepage and Luton guide. */
export function LocalMenuDiscovery() {
  return (
    <section className="md-local-menu-discovery" aria-labelledby="local-menu-discovery-title">
      <div className="md-local-menu-intro">
        <h3 id="local-menu-discovery-title">What are you craving in Luton?</h3>
        <p>Choose a menu, then mix dishes from different brands in one basket.</p>
      </div>
      <nav aria-label="Browse food menus in Luton">
        <ul className="md-local-menu-links">
          {MEALDECK_MENU_PAGES.map((page) => (
            <li key={page.brandId}>
              <Link
                to="/menus/$brandId"
                params={{ brandId: page.brandId }}
                aria-label={`${page.linkLabel} in Luton — ${page.brandName} menu`}
              >
                <span>
                  <strong>{page.linkLabel}</strong>
                  <small>{page.brandName} menu</small>
                </span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/menus/$brandId"
              params={{ brandId: "moktl" }}
              search={{ section: "desserts" }}
              aria-label="Milk cake and desserts in Luton — browse Biscoff and Oreo milkcakes"
            >
              <span>
                <strong>Milk cake &amp; desserts</strong>
                <small>Biscoff &amp; Oreo</small>
              </span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </nav>
      <p className="md-local-menu-desserts">
        Finish with a Biscoff or Oreo milk cake, listed in the Desserts section of every menu. Order
        your Luton takeaway for collection or kerbside pickup from Selbourne Road.
      </p>
    </section>
  );
}
