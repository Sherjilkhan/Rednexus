import { Link } from "react-router-dom";
import Logo from "../components/Logo.jsx";
import { useEffect } from "react";
import AOS from "aos";
import "aos/dist/aos.css";
import ps from "../assets/problem.webp";
import s1 from "../assets/solution1.webp";
import s2 from "../assets/solution2.webp";
import vh from "../assets/visionhero.png";
const LOOP = [
  [
    "1",
    "Blood bank reports daily usage",
    "Units issued per blood group, every day. Under a minute on the dashboard.",
  ],
  [
    "2",
    "System proposes a threshold",
    "A 14-day rolling average becomes a minimum stock level and a weekly collection target.",
  ],
  [
    "3",
    "A person confirms it",
    "Staff can edit the number, then confirm. Nothing goes active on its own — ever.",
  ],
  [
    "4",
    "Donors are asked only when needed",
    "Stock dips below the confirmed line, staff approve the draft alert, and the smallest sufficient set of eligible donors is contacted.",
  ],
];

export default function Landing() {
  useEffect(() => {
    AOS.init({
      duration: 800, // animation duration in ms
    });
  }, []); 
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <span className="eyebrow" data-aos="zoom-out-right">
            Consumption-calibrated blood supply
          </span>
          <h1 data-aos="zoom-out-right">SUSTAINING THE FLOW</h1>
          <p className="lede" data-aos="fade-left">
            <h2>
              Closing the gap between <i>Burst</i> donation and <i>Daily</i>{" "}
              hospital demand.
            </h2>
            <h3>Real-time Demand Tracking</h3>
            <h3>Predictive Minimum Stocks</h3>
          </p>
          <div className="grid-3" data-aos="fade-right">
            <h2>
              {" "}
              Get started
              <span class="material-symbols-outlined">arrow_outward</span>
            <h3>A synchronized network bridging donor availability with real-time hospital demand.</h3>
            </h2>
            <div className="row " style={{ marginTop: 28,flexDirection: "row", flexWrap: "no-wrap", gap: 12 }}>
              <Link to="/register" className="btn btn-primary btn-lg">
                Register as a Donor
              </Link>
              <Link to="/register-institution" className="btn btn-ghost btn-lg">
                Register as a Blood bank
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className="section section-alt">
        <p
          className="wrap"
          style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}
        >
          <h1
            style={{
              marginBottom: 12,
              fontSize: 50,
              fontWeight: 800,
              color: "black",
            }}
            data-aos="zoom-in"
          >
            Camps bring blood in bursts. Hospitals need it every single day.
          </h1>
          <h4
            style={{ marginBottom: 12, fontSize: 20, fontWeight: 400 }}
            data-aos="flip-up"
          >
            Sporadic donation drives leave shelves full on Sunday and empty by
            Wednesday. India doesn't have a donor shortage; it has a sync
            problem.
          </h4>
        </p>
        <div
          className="row"
          style={{ marginTop: 28, gap: 12, justifyContent: "center" }}
        >
          <div
            className="card"
            style={{
              background: "var(--red-500)",
              borderRadius: "20px",
              height: 250,
            }}
            data-aos="zoom-in-right"
          >
            <div
              className="card"
              style={{
                maxWidth: 200,
                border: "0px",
                height: 200,
                paddingTop: 80,
                textAlign: "left",
              }}
            >
              <h1 style={{ fontSize: 60, fontWeight: 800 }}>1.0M+</h1>
              <h4 style={{ marginBottom: 12, fontSize: 10, fontWeight: 400 }}>
                India faces annual shortfalls, leaving critical emergency care
                scrambling daily.
              </h4>
            </div>
          </div>
          <div
            className="card"
            style={{
              maxWidth: 600,
              textAlign: "center",
              border: "0px",
              boxShadow: "0px 0px 0px 0px",
            }}
            data-aos="zoom-in-up"
          >
            <img src={ps} alt="Problem illustration" />
          </div>
          <div
            className="card"
            style={{
              background: "var(--red-500)",
              borderRadius: "20px",
              height: 250,
            }}
            data-aos="zoom-in-left"
          >
            <div
              className="card"
              style={{
                maxWidth: 200,
                border: "0px",
                height: 200,
                paddingTop: 20,
                textAlign: "left",
              }}
            >
              <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 400 }}>
                <b>"</b>Over 3 million units are required annually just for
                emergency obstetric care and chronic conditions like
                thalassemia. One-off camps can’t support recurring patients—we
                need predictable, daily appointments. <b>"</b>{" "}
              </h4>
            </div>
          </div>
        </div>
      </section>
      <section className="section" style={{ overflow: "hidden" }}>
        <span className="wrap">
          <h1
            style={{
              fontSize: 80,
              fontWeight: 800,
              textTransform: "uppercase",
              textAlign: "center",
            }}
            data-aos="flip-up"
          >
            BLOOD
          </h1>
          <h1
            style={{ fontSize: 80, fontWeight: 800, textAlign: "center" }}
            data-aos="flip-up"
          >
            CALIBRATED
          </h1>
          <h1
            style={{ fontSize: 80, fontWeight: 800, textAlign: "center" }}
            data-aos="flip-up"
          >
            SUPPLY
          </h1>
        </span>

        <div className="bg-grid"></div>
        <div
          className="loop"
          style={{ gap: 24, justifyContent: "center", maxWidth: 1000 }}
        >
          {LOOP.map(([n, title, body]) => (
            <div className="loop-step" key={n} data-aos="fade-up">
              <div className="n">{n}</div>
              <h4 style={{ margin: "6px 0" }}>{title}</h4>
              <p className="small" style={{ margin: 0 }}>
                {body}
              </p>
            </div>
          ))}
        </div>
        <div
          className="note note-red"
          style={{ maxWidth: 700 }}
          data-aos="fade-up"
        >
          <strong>Hard rule.</strong> No threshold and no donor alert is ever
          activated automatically. Every confirmation records who did it and
          when. There is no auto-confirm setting anywhere in the product.
        </div>
        <div className="row-sln">
          <img
            src={s1}
            className="sln-img-1"
            alt="Solution illustration 1"
            style={{ marginTop: 48 }}
          />
          <img
            src={s2}
            className="sln-img-2"
            alt="Solution illustration 2"
            style={{ marginTop: 48 }}
          />
        </div>
      </section>
      <section className="section" style={{ width: "100%", overflow: "hidden", marginTop: -250 , display:"flex", flexDirection:"column", alignItems:"center"}}>
        <div className="wrap" style={{display:"flex", flexDirection:"column", alignItems:"center",  textAlign: "center" }}>
          <h4 style={{ maxWidth: 700, marginBottom: 12, fontSize: 30, fontWeight: 300, textAlign: "center" }} data-aos="flip-up"> 
            <b style={{fontWeight:900}}>"</b>
            To build a country where every blood bank operates on real signals
            rather than guesswork—ensuring no critical patient scrambles at the
            last hour, and every donor notification is guided by human
            responsibility.
            <b style={{fontWeight:900}}>"</b>
          </h4>
          <h1 style={{fontSize:150, color: "var(--red-700)"}}>OUR VISION</h1>
        </div>
        <img src={vh} alt="Vision hero" className="hero-vision" />
      </section>
      <section className="section">
        <div className="wrap grid grid-3">
          <div className="card">
            <h4>For donors</h4>
            <p className="small">
              You hear from your blood bank only when your group is actually
              needed and you are eligible. Set a monthly contact cap, pause any
              time, and see your own donation history.
            </p>
          </div>
          <div className="card">
            <h4>For blood bank staff</h4>
            <p className="small">
              One dashboard: report the day's usage, confirm proposed
              thresholds, approve outbound alerts, post camps. Both in-house and
              standalone blood banks work the same way.
            </p>
          </div>
          <div className="card">
            <h4>For the platform admin</h4>
            <p className="small">
              Approve which blood banks may operate. A bank cannot report usage,
              confirm a threshold, or contact a single donor until it is
              verified and has at least one staff account.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="wrap grid grid-2">
          <div>
            <span className="eyebrow">Try the demo</span>
            <h2 style={{ marginTop: 8 }}>Three surfaces, three logins</h2>
            <p className="small">
              The demo runs on seeded data: one verified in-house blood bank
              with 30 days of usage, one external bank awaiting approval, and 15
              donors across every blood group.
            </p>
            <Link to="/register-institution" className="btn btn-ghost btn-sm">
              Register a blood bank
            </Link>
          </div>
          <div className="card">
            <h4 style={{ marginBottom: 12 }}>Demo credentials</h4>
            <div className="cred">
              <div>
                <strong>Blood bank staff</strong> —{" "}
                <code>staff@citybank.in</code> / <code>staff123</code>
              </div>
              <div>
                <strong>Donor</strong> — <code>donor@example.com</code> /{" "}
                <code>donor123</code>
              </div>
              <div>
                <strong>Platform admin</strong> —{" "}
                <code>admin@raktasetu.in</code> / <code>admin123</code>
              </div>
              <div className="muted xs" style={{ marginTop: 6 }}>
                Phone verification code in the demo is 123456.
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="site">
        <div className="wrap row-between">
          <Logo size={22} />
          <div className="small muted">
            No payments, no incentives, no direct donor–patient contact. Donor
            contact details are visible only to verified blood bank staff.
          </div>
        </div>
      </footer>
    </>
  );
}
