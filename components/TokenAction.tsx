"use client";

import { useState } from "react";
import { Button, Message, callApi, errorText } from "./client";

// Email links open a page with a button; the action itself is a POST, never the GET of the
// link (NFR-02: no state change on GET).

export default function TokenAction(props: {
  title: string;
  button: string;
  endpoint: string;
  token: string;
  danger?: boolean;
  doneLink?: { href: string; label: string };
}) {
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{props.title}</h1>
      {result ? (
        <>
          <Message text={result.text} kind={result.ok ? "info" : "error"} />
          {props.doneLink && result.ok && <a href={props.doneLink.href} className="text-brand underline">{props.doneLink.label}</a>}
        </>
      ) : (
        <Button
          kind={props.danger ? "danger" : "primary"}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await callApi(props.endpoint, "POST", { token: props.token });
            setResult({ ok: r.ok, text: r.ok ? r.data.message : errorText(r) });
            setBusy(false);
          }}
        >
          {props.button}
        </Button>
      )}
    </section>
  );
}
