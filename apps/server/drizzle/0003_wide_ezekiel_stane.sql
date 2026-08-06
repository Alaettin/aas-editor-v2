-- Die Versionierung faellt weg (Entscheidung vom 06.08.2026): Speichern ueberschreibt,
-- und ohne den Konfliktdialog gab es niemanden mehr, der einen Schnappschuss anlegte.
--
-- ACHTUNG: dieser Schritt loescht Daten. Abgelegte Schnappschuesse sind danach fort, und
-- keine spaetere Migration bringt sie zurueck. Das ist so entschieden.
DROP TABLE `project_versions`;
