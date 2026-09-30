import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JoinMembershipForms } from "./join-forms";

const claim = async () => {};
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
  it("puts each placeholder id in a hidden field on its own form", () => {
    const html = render([
      { id: "member-1", displayName: "Sam" },
      { id: "member-2", displayName: "Alex" },
    ]);

    expect(html.match(/<form\b/g)).toHaveLength(3);
    expect(html).toContain('name="memberId"');
    expect(html).toContain('value="member-1"');
    expect(html).toContain('value="member-2"');
    expect(html).toContain('name="token"');
    // React overwrites a formAction button's name and omits it from FormData.
    expect(html).not.toMatch(/<button\b[^>]*\bname="memberId"/);
    expect(html).not.toMatch(/<button\b[^>]*\bformAction=/);
  });

  it("keeps the account-photo choice on the claim form", () => {
    const html = render([{ id: "member-1", displayName: "Sam" }]);
    const claimForm = html.slice(0, html.lastIndexOf("<form"));
    expect(claimForm).toContain('name="accountPhotoChoice"');
    expect(claimForm).toContain('name="useAccountPhoto"');
    expect(claimForm).toContain('value="on"');
  });
});
