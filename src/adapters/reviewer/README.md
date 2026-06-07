# Reviewer Adapters

Reviewer adapters will connect role-oriented reviewer contracts to concrete model providers or tools.

P0 keeps runtime calls out of this directory. Later implementations should:

- implement app ports,
- keep reviewer execution read-only,
- avoid formal approval assumptions,
- avoid sharing hidden context between reviewer passes.
