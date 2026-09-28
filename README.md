<p align="center">
  <img src="frontend/public/healthtrace-mark.svg" alt="PatientPrivy" width="340" />
</p>

<h1 align="center">PatientPrivy</h1>

<p align="center">
  <strong>See where your health data goes. Then take it back.</strong>
</p>

<p align="center">
  <a href="https://devpost.com/software/privy-vle0r8"><img src="https://img.shields.io/badge/Best_Use_of_Machine_Learning_%26_AI-Winner-0057EF?style=for-the-badge" alt="Winner — Best Use of Machine Learning and AI" /></a>
  &nbsp;
  <a href="https://devpost.com/software/privy-vle0r8"><img src="https://img.shields.io/badge/Best_Event_Engagement-Winner-00B3A4?style=for-the-badge" alt="Winner — Best Event Engagement" /></a>
</p>

<p align="center">
  <a href="https://tigerhacks-2026.devpost.com/"><img src="https://img.shields.io/badge/TigerHacks-2026-111111?style=for-the-badge" alt="TigerHacks 2026" /></a>
  &nbsp;
  <a href="https://scriptwell.fly.dev"><img src="https://img.shields.io/badge/Try_the_demo-ScriptWell-009DFF?style=for-the-badge" alt="Try the ScriptWell demo" /></a>
  &nbsp;
  <a href="https://devpost.com/software/privy-vle0r8"><img src="https://img.shields.io/badge/Read_the_story-Devpost-6C5CE7?style=for-the-badge" alt="PatientPrivy on Devpost" /></a>
</p>

Health sites often promise that your information is “HIPAA protected.” Sensitive details can still leave the browser for third parties, and most people never see it happen.

**PatientPrivy** is a Chrome extension that shows what left your device, where it went, and what you can do about it. An on-device model flags sensitive fields. You stay in control: nothing is emailed or filed until you approve it.

We built it in a weekend at [TigerHacks 2026](https://tigerhacks-2026.devpost.com/) and won **Best Use of Machine Learning & AI** and **Best Event Engagement**.

<table>
  <tr>
    <td width="33%" valign="top">
      <h3 align="center">See it</h3>
      <p align="center">A live map of data leaving a health site, in a simple view or a clickable 3D network.</p>
    </td>
    <td width="33%" valign="top">
      <h3 align="center">Understand it</h3>
      <p align="center">Machine learning on your machine turns messy fields into plain-language privacy issues.</p>
    </td>
    <td width="33%" valign="top">
      <h3 align="center">Act on it</h3>
      <p align="center">Review an opt-out letter before it sends, or autofill a class-action claim when you qualify.</p>
    </td>
  </tr>
</table>

## Try it

Open [ScriptWell](https://scriptwell.fly.dev), a fictional prescription-savings site, and confirm an offer. PatientPrivy shows what was sent and where it went.

Screenshots and the full story are on our [Devpost page](https://devpost.com/software/privy-vle0r8).

## Built with

React · TypeScript · Chrome · Python · Three.js · an on-device model

## Team

<p align="center">
  <a href="https://github.com/asyaafv"><strong>Asya Erdogan</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/gnichol479"><strong>Gibson Nichol</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/AamirAbatiyow"><strong>Aamir Abatiyow</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/ademerdogan2008"><strong>Adem Erdogan</strong></a>
</p>

## Run it locally

```sh
npm ci --prefix frontend && npm run build:extension --prefix frontend
./start_demo.sh
```

Load `extension/` in Chrome, then use [ScriptWell](https://scriptwell.fly.dev). Setup details are in the [demo guide](docs/integrated-demo.md).

<p align="center"><sub>A hackathon demo of data disclosure. Not a medical service, and not legal advice. The claim form does not file a real case.</sub></p>
