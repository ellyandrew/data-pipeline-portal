const regionMap = {
  // county 37 -- kakamega

  "Kakamega": {
    code: "037",
    subcounties: {
      "Lugari": {
        code: "199",
        wards: {"Mautuma": "01", "Lugari": "02", "Lumakanda": "03", "Chekalini": "04", "Chevaywa": "05", "Lwandeti": "06"}
      },
      "Likuyani": {
        code: "200",
        wards: {"Likuyani": "01", "Sango": "02", "Kongoni": "03", "Nzoia": "04", "Sinoko": "05"}
      },
      "Malava": {
        code: "201",
        wards: {"West Kabras": "01", "Chemuche": "02", "East Kabras": "03", "Butali/Chegulo": "04", "Manda-Shivanga": "05", "Shirugu-Mugai": "06", "South Kabras": "07"}
      },
      "Lurambi": {
        code: "202",
        wards: {"Butsotso East": "01", "Butsotso South": "02", "Butsotso Central": "03", "Sheywe": "04", "Mahiakalo": "05", "Shirere": "06"}
      },
      "Navakholo": {
        code: "203",
        wards: {"Ingostse-Mathia": "01", "Shinoyi-Shikomari-Esumeyia": "02", "Bunyala West": "03", "Bunyala East": "04", "Bunyala Central": "05"}
      },
      "Mumias West": {
        code: "204",
        wards: {"Mumias Central": "01", "Mumias North": "02", "Etenje": "03", "Musanda": "04"}
      },
      "Mumias East": {
        code: "205",
        wards: {"Lusheya/Lubinu": "01", "Malaha/Isongo/Makunga": "02", "East Wanga": "03"}
      },
      "Matungu": {
        code: "206",
        wards: {"Koyonzo": "01", "Kholera": "02", "Khalaba": "03", "Mayoni": "04", "Namamali": "05"}
      },
      "Butere": {
        code: "207",
        wards: {"Marama West": "01", "Marama Central": "02", "Marenyo-Shianda": "03", "Marama North": "04", "Marama South": "05"}
      },
      "Khwisero": {
        code: "208",
        wards: {"Kisa North": "01", "Kisa East": "02", "Kisa West": "03", "Kisa Central": "04"}
      },
      "Shinyalu": {
        code: "209",
        wards: {"Isukha North": "01", "Murhanda": "02", "Isukha Central": "03", "Isukha South": "04", "Isukha East": "05", "Isukha West": "06"}
      },
      "Ikolomani": {
        code: "210",
        wards: {"Idakho South": "01", "Idakho East": "02", "Idakho North": "03", "Idakho Central": "04"}
      }
    }
  },

  // county 42 -- kisumu

  "Kisumu": {
    code: "042",
    subcounties: {
      "Kisumu East": {
        code: "238",
        wards: {"Kajulu": "01", "Kolwa East": "02", "Manyatta B": "03", "Nyalenda A": "04", "Kolwa Central": "05"}
      },
      "Kisumu West": {
        code: "239",
        wards: {"South West Kisumu": "01", "Central Kisumu": "02", "Kisumu North": "03", "West Kisumu": "04", "North West Kisumu": "05"}
      },
      "Kisumu Central": {
        code: "240",
        wards: {"Railways": "01", "Migosi": "02", "Shaurimoyo Kaloleni": "03", "Market Milimani": "04", "Kondele": "05", "Nyalenda B": "06"}
      },
      "Seme": {
        code: "241",
        wards: {"West Seme": "01", "Central Seme": "02", "East Seme": "03", "North Seme": "04"}
      },
      "Nyando": {
        code: "242",
        wards: {"East Kano/Wawidhi": "01", "Awasi/Onjiko": "02", "Ahero": "03", "Kabonyo/Kanyagwal": "04", "Kobura": "05"}
      },
      "Muhoroni": {
        code: "243",
        wards: {"Miwani": "01", "Ombei": "02", "Masogo/Nyang'oma": "03", "Chemelil": "04", "Muhoroni/Koru": "05"}
      },
      "Nyakach": {
        code: "244",
        wards: {"South West Nyakach": "01", "North Nyakach": "02", "Central Nyakach": "03", "West Nyakach": "04", "South East Nyakach": "05"}
      }
    }
  },
  // county 47 --- nairobi

  "Nairobi": {
    code: "047",
    subcounties: {
      "Westlands": {
        code: "274",
        wards: {"Kitisuru": "01", "Parklands/Highridge": "02", "Karura": "03", "Kangemi": "04", "Mountain View": "05"}
      },
      "Dagoretti North": {
        code: "275",
        wards: {"Kilimani": "01", "Kawangware": "02", "Gatina": "03", "Kileleshwa": "04", "Kabiro": "05"}
      },
      "Dagoretti South": {
        code: "276",
        wards: {"Mutu-ini": "01", "Ngando": "02", "Riruta": "03", "Uthiru/Ruthimitu": "04", "Waithaka": "05"}
      },
      "Langata": {
        code: "277",
        wards: {"Karen": "01", "Nairobi West": "02", "Mugumu-ini": "03", "South C": "04", "Nyayo Highrise": "05"}
      },
      "Kibra": {
        code: "278",
        wards: {"Laini Saba": "01", "Lindi": "02", "Makina": "03", "Woodley/Kenyatta Golf Course": "04", "Sarangombe": "05"}
      },
      "Roysambu": {
        code: "279",
        wards: {"Githurai": "01", "Kahawa West": "02", "Zimmerman": "03", "Roysambu": "04", "Kahawa": "05"}
      },
      "Kasarani": {
        code: "280",
        wards: {"Clay City": "01", "Mwiki": "02", "Kasarani": "03", "Njiru": "04", "Ruai": "05"}
      },
      "Ruaraka": {
        code: "281",
        wards: {"Baba Dogo": "01", "UtalIi": "02", "Mathare North": "03", "Lucky Summer": "04", "Korogocho": "05"}
      },
      "Embakasi South": {
        code: "282",
        wards: {"Imara Daima": "01", "Kwa Njenga": "02", "Kwa Reuben": "03", "Pipeline": "04", "Kware": "05"}
      },
      "Embakasi North": {
        code: "283",
        wards: {"Kariobangi North": "01", "Dandora Area I": "02", "Dandora Area II": "03", "Dandora Area III": "04", "Dandora Area IV": "05"}
      },
      "Embakasi Central": {
        code: "284",
        wards: {"Kayole North": "01", "Kayole Central": "02", "Kayole South": "03", "Komarock": "04", "Matopeni/Spring Valley": "05"}
      },
      "Embakasi East": {
        code: "285",
        wards: {"Upper Savannah": "01", "Lower Savannah": "02", "Embakasi": "03", "Utawala": "04", "Mihango": "05"}
      },
      "Embakasi West": {
        code: "286",
        wards: {"Umoja I": "01", "Umoja II": "02", "Mowlem": "03", "Kariobangi South": "04"}
      },
      "Makadara": {
        code: "287",
        wards: {"Maringo/Hamza": "01", "Viwandani": "02", "Harambee": "03", "Makongeni": "04"}
      },
      "Kamukunji": {
        code: "288",
        wards: {"Pumwani": "01", "Eastleigh North": "02", "Eastleigh South": "03", "Airbase": "04", "California": "05"}
      },
      "Starehe": {
        code: "289",
        wards: {"Nairobi Central": "01", "Ngara": "02", "Pangani": "03", "Ziwani/Kariokor": "04", "Landimawe": "05", "Nairobi South": "06"}
      },
      "Mathare": {
        code: "290",
        wards: {"Hospital": "01", "Mabatini": "02", "Huruma": "03", "Ngei": "04", "Mlango Kubwa": "05", "Kiamaiko": "06"}
      }
    }
  }

};

module.exports = regionMap;