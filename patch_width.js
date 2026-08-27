const fs = require('fs');
let code = fs.readFileSync('lib/m3/widgets/fhir_data_viewer.dart', 'utf8');

// 1. Invoice Table
code = code.replace(
`          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              headingRowHeight: 40,`,
`          LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minWidth: constraints.maxWidth),
                  child: DataTable(
                    headingRowHeight: 40,`
);

code = code.replace(
`                  ]
                );
              }).toList(),
            ),
          ),
          
          // Footer / Total`,
`                  ]
                );
              }).toList(),
                  ),
                ),
              );
            },
          ),
          
          // Footer / Total`
);

// 2. Diagnostic Report Table
code = code.replace(
`          // Items Table
          if (reportObs.isNotEmpty)
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                headingRowHeight: 40,`,
`          // Items Table
          if (reportObs.isNotEmpty)
            LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minWidth: constraints.maxWidth),
                    child: DataTable(
                      headingRowHeight: 40,`
);

code = code.replace(
`                  ]
                  );
                }).toList(),
              ),
            ),
          if (reportObs.isEmpty)`,
`                  ]
                  );
                }).toList(),
                    ),
                  ),
                );
              },
            ),
          if (reportObs.isEmpty)`
);

// 3. Prescription Table
code = code.replace(
`          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              headingRowHeight: 40,`,
`          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minWidth: constraints.maxWidth),
                  child: DataTable(
                    headingRowHeight: 40,`
);

code = code.replace(
`                  ]
                );
              }).toList(),
            ),
          ),
        ),
        const SizedBox(height: 24),`,
`                  ]
                );
              }).toList(),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 24),`
);

fs.writeFileSync('lib/m3/widgets/fhir_data_viewer.dart', code);
console.log("Patched widths for tables");
