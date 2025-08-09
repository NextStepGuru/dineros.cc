#!/usr/bin/env node

// Simple script to test the live API endpoint
// Usage: node scripts/test-live-api.js

async function testLiveAPI() {
  const baseUrl = "http://localhost:3000";
  const endpoint = "/api/register";
  const params = new URLSearchParams({
    accountRegisterId: "1",
    accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c",
    direction: "future",
    take: "50",
    skip: "0",
    loadMode: "full",
  });

  const url = `${baseUrl}${endpoint}?${params}`;

  console.log("=== TESTING LIVE API ===");
  console.log(`URL: ${url}`);
  console.log("");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie:
          "authToken=eyJhbGciOiJQUzUxMiIsInR5cCI6IkpXVCIsImtpZCI6ImVzZjl2YmpycWM0cjYwbHNmaXpmdzcyeiJ9.eyJ1c2VySWQiOjEsImp3dEtleSI6InY0OTk1OWFhOWwza2VycWMycWdsNnF1bCIsImlhdCI6MTc1NDc1MzE3NCwiZXhwIjoxNzU0ODM5NTc0fQ.SqMo_hflyuNhNbnYs6g6FcT1uBqhbt46PCJ4AR_5wCsWzjJ7A6rnNjrSKL4ckeal_r2vWBYJzg0twcG4JreW9AolnOMOzMpPVUAUkBkuSlgf9pq_0KqrDdkxFEZGIz9XHZpEp-Bhacnn4ju2KMk9jF3HeRf-q42LzFn2mVQyyykO2zeQVfaMIREgpa2vqDe9drmlxqgwq1o7hPd1jCP1hngZxg1qWFSuOZ0IThfsaC_ESGZx99m5091wEDDn8fgKUtS6keiYLqOufzjrrwLAlpDzp5_J5QPrWHp0zAegHuilfw0Rhy1s6E-46e7vPHxu9iIlM4CIq_0Zyt4_XlbfysTwI2WEuSetNV79O_O99UVi4u0IM4PIb_FHRzOJG-4chVtuOdH5r1BHGpEHGQF0c3hla2G6UonAyhIfWlP3V6JnNaWB-GSD4_R-inrlU-NTkBan9YJuFL1i1nRd8H3XyT-oYtM3vqVeD4TzVz95oSPrx2KasJtn5EmvISN3Y1lJ6aCieVPgQx64qImsgvD74se8OKCm96-4uC4Px9pmhxGoE467A5yrXf6Aucjmvr09-av3qm7qkikR0xf59WsTkc6jHRheCJ1E0RjbjULHkV6ZZnYhfwtKiLtLkUE5pkk5IE2CuVCcwH07ZOoO7WphIyRIZ1AUCGHvKW4CyJKTqcQ",
      },
    });

    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error("Response:", text);
      return;
    }

    const data = await response.json();

    console.log("✅ API Response received");
    console.log(`Total entries: ${data.entries?.length || 0}`);
    console.log(`Load mode: ${data.loadMode}`);
    console.log(`Skip: ${data.skip}, Take: ${data.take}`);
    console.log("");

    if (data.entries && data.entries.length > 0) {
      console.log("=== ENTRY ANALYSIS ===");

      // Find key entries
      const balanceEntry = data.entries.find((e) => e.isBalanceEntry);
      const manualEntries = data.entries.filter((e) => e.isManualEntry);

      console.log(`Balance entry found: ${balanceEntry ? "YES" : "NO"}`);
      console.log(`Manual entries found: ${manualEntries.length}`);

      if (balanceEntry) {
        const balanceIndex = data.entries.indexOf(balanceEntry);
        console.log(`Balance entry position: ${balanceIndex}`);
        console.log(`Balance entry: "${balanceEntry.description}"`);
        console.log("");

        console.log("=== MANUAL ENTRY SORTING ANALYSIS ===");
        let sortingIssuesFound = 0;

        manualEntries.forEach((manual, i) => {
          const manualIndex = data.entries.indexOf(manual);
          const position = manualIndex < balanceIndex ? "BEFORE" : "AFTER";
          const expectedPosition = manual.isMatched ? "BEFORE" : "AFTER";
          const isCorrect = position === expectedPosition;

          console.log(`${i + 1}. "${manual.description}"`);
          console.log(`   - isMatched: ${manual.isMatched}`);
          console.log(`   - isPending: ${manual.isPending}`);
          console.log(`   - isProjected: ${manual.isProjected}`);
          console.log(`   - isCleared: ${manual.isCleared}`);
          console.log(`   - isManualEntry: ${manual.isManualEntry}`);
          console.log(`   - Position: ${manualIndex} (${position} balance)`);
          console.log(`   - Expected: ${expectedPosition} balance`);
          console.log(
            `   - Status: ${isCorrect ? "✅ CORRECT" : "❌ INCORRECT"}`
          );

          // Show why this entry is being placed where it is
          const pendingCondition = !manual.isProjected && manual.isPending;
          const manualMatchedCondition =
            manual.isManualEntry && manual.isMatched === true;
          const shouldGoBeforeBalance =
            pendingCondition || manualMatchedCondition;

          console.log(
            `   - Should go before balance: ${shouldGoBeforeBalance}`
          );
          console.log(
            `     * Pending condition (!isProjected && isPending): ${pendingCondition}`
          );
          console.log(
            `     * Manual matched condition (isManualEntry && isMatched === true): ${manualMatchedCondition}`
          );
          console.log("");

          if (!isCorrect) {
            sortingIssuesFound++;
          }
        });

        console.log("=== SUMMARY ===");
        if (sortingIssuesFound === 0) {
          console.log("✅ All manual entries are sorted correctly!");
        } else {
          console.log(`❌ Found ${sortingIssuesFound} sorting issue(s)`);
          console.log("");
          console.log("EXPECTED BEHAVIOR:");
          console.log(
            "- Manual entries with isMatched=true should appear BEFORE balance"
          );
          console.log(
            "- Manual entries with isMatched=false should appear AFTER balance"
          );
        }
      } else {
        console.log("❌ No balance entry found");
        console.log("This might explain why sorting is not working correctly.");
        console.log("");
        console.log("=== ALL ENTRIES ===");
        data.entries.forEach((entry, i) => {
          const type = entry.isBalanceEntry
            ? "[BALANCE]"
            : entry.isManualEntry
            ? "[MANUAL]"
            : "[REGULAR]";
          console.log(
            `${i}: ${entry.description} ${type} | manual=${entry.isManualEntry} | matched=${entry.isMatched}`
          );
        });
      }
    } else {
      console.log("❌ No entries found in response");
      console.log("Response data:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("❌ Error calling API:", error.message);
  }
}

// Run the test
testLiveAPI();
