# Ruokaviikko

Mobiiliystävällinen viikon ruokalistasuunnittelija. Sovellus arpoo 5 tai 7 arkiruokaa, skaalaa ostoslistan henkilömäärälle ja antaa painottaa K-Citymarket Kupittaan tarjouksiin sopivia raaka-aineita.

## Ominaisuudet

- oletusperhe: 2 aikuista ja 2 lasta
- erilliset henkilömäärälaskurit
- 5 päivän tai 7 päivän suunnitelma
- tarjouspainotus: kana, jauheliha, kala, kasvis tai makkara
- yksittäisten päivien lukitus ennen uutta arvontaa
- automaattisesti yhdistetty ja skaalattu ostoslista
- linkit K-Ruoka-resepteihin ja Kupittaan tarjouksiin
- asetusten ja suunnitelman paikallinen tallennus

## Testit

```bash
npm test
```

## Rajaus

Testiversio ei lue henkilökohtaisia Plussa-etuja tai K-Ruoan hintoja automaattisesti. K-Ruoka suojaa kauppa-API:a Cloudflare-haasteella, joten sovellus ohjaa ajankohtaiset tarjoukset ja reseptit K-Ruoan omille sivuille eikä kierrä suojausta.
