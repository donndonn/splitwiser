import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JoinMembershipForms } from "./join-forms";

const claim: (memberId: string, formData: FormData) => Promise<void> = async () => {};
const joinNew = async () => {};

function render(placeholders: { id: string; displayName: string }[]) {
  return renderToStaticMarkup(
    createElement(JoinMembershipForms, {
      token: "invite-token",
      placeholders,
      defaultName: "Pat",
      accountPhoto: { image: "/a.png", provider: "Google" },
      claimPlaceholderAction: claim,
      joinAsNewMemberAction: joinNew,
    }),
  );
}

describe("join membership forms", () => {
  it("binds the placeholder id instead of putting it on the submit button", () => {
    const html = render([
      { id: "member-1", displayName: "Sam" },
      { id: "member-2", displayName: "Alex" },
    ]);

    expect(html.match(/<form\b/g)).toHaveLength(1);
    expect(html).toContain('name="token"');
    expect(html).not.toMatch(/name="memberId"/);
    expect(html).not.toMatch(/<button\b[^>]*\bname=/);
    expect(html).toMatch(/<button\b[^>]*\bformAction=/);
    expect(html).toContain(">Sam<");
    expect(html).toContain(">Alex<");
  });

  it("keeps the account-photo choice in the same form", () => {
    const html = render([{ id: "member-1", displayName: "Sam" }]);
    expect(html).toContain('name="accountPhotoChoice"');
    expect(html).toContain('name="useAccountPhoto"');
  });
});
