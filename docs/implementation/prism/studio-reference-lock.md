# Prism Studio Reference Lock

Primary foundation: Puck's declared components, slots, fields, permissions, history, and
viewport model.

Preserve:

- one clear visual canvas;
- direct manipulation through owned components;
- explicit insert and property controls;
- structured data instead of generated code.

Borrow only:

- Framer's clear edit versus preview modes;
- mobile bottom sheets instead of compressed desktop sidebars;
- a narrow experience navigator instead of a general vector-layer tree.

Reject:

- arbitrary CSS and JavaScript;
- floating tool clutter;
- hidden responsive changes;
- decorative gradients and generic violet editor chrome;
- Puck data as canonical Prism state.

Token commitments:

- near-black canvas and flat dark panels;
- warm orange for primary actions only;
- compact system typography;
- thin neutral borders, low radius, and no decorative shadow;
- dense controls with 44-pixel mobile touch targets.

Decision ledger:

- Puck owns editor interaction only. The Prism reducer owns every saved change.
- Edit and Preview are separate so user actions are not mistaken for editor actions.
- Mobile uses three actions and one bottom sheet. It does not copy desktop sidebars.
- The prototype is evidence. It is not production application code.
