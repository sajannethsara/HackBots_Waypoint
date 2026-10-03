/**
 * Finger-sized controls on touch screens (tablets at the dock, often with gloves): put on a container,
 * it brings every button, checkbox, radio, input, select and tab inside it up to ~44 px.
 * Only `pointer: coarse` devices are affected; mouse and trackpad users see the normal sizes.
 * Dialogs and select menus render in a portal outside the page, so they carry it themselves.
 */
export const TOUCH = [
  "pointer-coarse:[&_[data-slot=button]]:min-h-11",
  "pointer-coarse:[&_[data-slot=button]]:min-w-11",
  "pointer-coarse:[&_[data-slot=button]]:px-3.5",
  "pointer-coarse:[&_[data-slot=checkbox]]:size-6",
  "pointer-coarse:[&_[data-slot=radio-group-item]]:size-6",
  "pointer-coarse:[&_[data-slot=input]]:min-h-11",
  "pointer-coarse:[&_[data-slot=textarea]]:text-base",
  "pointer-coarse:[&_[data-slot=select-trigger]]:min-h-11",
  "pointer-coarse:[&_[data-slot=tabs-list]]:h-11",
  "pointer-coarse:[&_[data-slot=tabs-trigger]]:px-3",
].join(" ")

/** For a select menu's content (portalled): taller rows on touch screens. */
export const TOUCH_MENU = "pointer-coarse:[&_[data-slot=select-item]]:min-h-11"
