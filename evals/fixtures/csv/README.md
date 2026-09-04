# CSV export

The public encodeRow function accepts strings and numbers. Each supplied field
must occupy one column, including empty strings and numeric zero. exportRows
applies that rule to every row. The output uses commas and quotes fields that
contain a comma, quote or newline.
