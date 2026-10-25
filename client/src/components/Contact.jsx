// Contact: contact info + form
// File location: src/components/Contact.jsx
import { useState } from "react";

// TODO: yahan apna email likho. Form "Send" dabane par user ka email app khulta hai.
const CONTACT_EMAIL = "your-email@example.com";
const TOPICS = ["General question", "Demo request", "Report an issue", "Collaboration"];

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", topic: TOPICS[0], message: "" });

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  const submit = (event) => {
    event.preventDefault();
    const subject = encodeURIComponent(`[HealTrack AI] ${form.topic}`);
    const body = encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <section className="section" id="contact">
      <div className="container contact">
        <div>
          <h2 className="section__title">Get in touch</h2>
          <p className="contact__text">
            Questions about the project, the demo or a collaboration? Write a message
            and it opens in your email app, ready to send.
          </p>
          <dl className="contact__info">
            <div>
              <dt className="contact__label">Email</dt>
              <dd className="contact__value">{CONTACT_EMAIL}</dd>
            </div>
            <div>
              <dt className="contact__label">Project</dt>
              <dd className="contact__value">HealTrack AI, hackathon prototype</dd>
            </div>
            <div>
              <dt className="contact__label">Data</dt>
              <dd className="contact__value">Simulated delivery network, no real couriers</dd>
            </div>
          </dl>
        </div>

        <form className="form" onSubmit={submit}>
          <div className="form__row">
            <div className="field">
              <label className="field__label" htmlFor="contact-name">Name</label>
              <input className="field__input" id="contact-name" name="name" value={form.name} onChange={update} placeholder="Your name" required />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="contact-email">Email</label>
              <input className="field__input" id="contact-email" name="email" type="email" value={form.email} onChange={update} placeholder="you@example.com" required />
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="contact-topic">Topic</label>
            <select className="field__input" id="contact-topic" name="topic" value={form.topic} onChange={update}>
              {TOPICS.map((topic) => <option key={topic}>{topic}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="contact-message">Message</label>
            <textarea className="field__input" id="contact-message" name="message" value={form.message} onChange={update} placeholder="How can we help?" required />
          </div>

          <div className="form__foot">
            <span className="form__note">Send opens your email app with this message filled in.</span>
            <button type="submit" className="btn btn--primary">Send message</button>
          </div>
        </form>
      </div>
    </section>
  );
}
